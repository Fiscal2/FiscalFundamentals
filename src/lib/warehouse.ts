import { supabase } from './supabase';
import { cikToTicker } from './tickers';
import {
  StockItem,
  StatementCode,
  FilingMeta,
  Statements,
  AnnualOverview,
} from './types';
import {
  RawLineItem,
  STATEMENT_CODES,
  ANNUAL_FORMS,
  groupStatements,
  buildAnnualOverview,
} from './xbrl';

// Data access for the SEC fundamentals warehouse. This module owns *where rows
// come from* (Supabase queries + per-session caching); turning rows into
// statements and metrics lives in the pure `./xbrl` module.

const PAGE_SIZE = 1000;

// --- Company search list ---

// The search list rarely changes (only when a new quarter is ingested), but it
// requires paging the whole `filing` table. Cache it in localStorage so a page
// refresh shows the search immediately instead of waiting on ~12 round-trips,
// and dedupe concurrent callers within a session via a shared in-flight promise.
const COMPANIES_CACHE_KEY = 'ff:companies:v1';
const COMPANIES_TTL_MS = 24 * 60 * 60 * 1000; // 24h
let companiesPromise: Promise<StockItem[]> | null = null;

function readCompaniesCache(): StockItem[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COMPANIES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; items: StockItem[] };
    if (!parsed?.items?.length) return null;
    if (Date.now() - parsed.ts > COMPANIES_TTL_MS) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function writeCompaniesCache(items: StockItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      COMPANIES_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), items })
    );
  } catch {
    // ignore quota / serialization errors; cache is best-effort
  }
}

// One distinct company per CIK, sourced from `filing` (one row per submission,
// ~4x smaller than the `fundamentals` view) and enriched with ticker/exchange
// from the SEC map.
async function fetchCompanies(): Promise<StockItem[]> {
  const seen = new Map<number, StockItem>();
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('filing')
      .select('cik, name')
      .order('cik', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      const cik = Number(row.cik);
      if (seen.has(cik)) continue;
      const info = cikToTicker(cik);
      seen.set(cik, {
        ticker: info?.ticker ?? String(cik),
        companyName: (row.name ?? info?.name ?? 'Unknown').trim(),
        listedExchange: info?.exchange ? [info.exchange] : null,
      });
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return Array.from(seen.values());
}

/**
 * Distinct companies present in the warehouse, enriched with ticker/exchange
 * from the SEC map. Drives the search list so users only pick companies that
 * actually have data loaded. Served from localStorage when available so the
 * search works immediately on a page refresh (any route).
 */
export async function getCompanies(): Promise<StockItem[]> {
  const cached = readCompaniesCache();
  if (cached) return cached;

  if (!companiesPromise) {
    companiesPromise = fetchCompanies()
      .then((items) => {
        writeCompaniesCache(items);
        return items;
      })
      .catch((err) => {
        companiesPromise = null; // allow retry on next mount
        throw err;
      });
  }
  return companiesPromise;
}

/**
 * The company's display name as stored in the warehouse `fundamentals` table.
 * Used by the dashboard so companies missing from the SEC ticker map (which is
 * keyed on listed tickers) still show their real name instead of a bare CIK.
 * Returns null if no named row exists.
 */
export async function getCompanyName(cik: number): Promise<string | null> {
  const { data, error } = await supabase
    .from('fundamentals')
    .select('name')
    .eq('cik', cik)
    .not('name', 'is', null)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const name = data?.name?.trim();
  return name ? name : null;
}

// --- Per-session caches ---

// Switching tabs or revisiting a company shouldn't re-hit the warehouse. The
// in-flight maps dedupe concurrent callers (e.g. the Overview load and the
// StatementsView mount racing for the same filing's rows).
const filingsCache = new Map<number, FilingMeta[]>();
const filingsInflight = new Map<number, Promise<FilingMeta[]>>();
const lineItemsCache = new Map<string, RawLineItem[]>();
const lineItemsInflight = new Map<string, Promise<RawLineItem[]>>();

/**
 * Filings for a company (most recent first), used to drive the statement
 * filing picker. Cached per cik for the session.
 */
export async function getFilings(cik: number): Promise<FilingMeta[]> {
  const cached = filingsCache.get(cik);
  if (cached) return cached;
  const existing = filingsInflight.get(cik);
  if (existing) return existing;

  const p = (async () => {
    const { data, error } = await supabase
      .from('filing')
      .select('adsh, form, period, fy, fp, filed')
      .eq('cik', cik)
      .order('period', { ascending: false, nullsFirst: false })
      .order('filed', { ascending: false });
    if (error) throw error;
    return (data ?? []) as FilingMeta[];
  })();

  filingsInflight.set(cik, p);
  try {
    const rows = await p;
    filingsCache.set(cik, rows);
    return rows;
  } finally {
    filingsInflight.delete(cik);
  }
}

/**
 * Raw line_item rows for one filing, cached/deduped per accession. This is the
 * single warehouse round trip behind both the Overview metrics and the
 * Statements tab, so a filing's rows are fetched at most once per session no
 * matter which view asks first.
 */
async function fetchLineItems(adsh: string): Promise<RawLineItem[]> {
  const cached = lineItemsCache.get(adsh);
  if (cached) return cached;
  const existing = lineItemsInflight.get(adsh);
  if (existing) return existing;

  const p = (async () => {
    const { data, error } = await supabase
      .from('line_item')
      .select('stmt, line, plabel, tag, value, uom, qtrs, ddate')
      .eq('adsh', adsh)
      .in('stmt', STATEMENT_CODES)
      .order('line')
      .order('ddate');

    if (error) throw error;

    return (data ?? []).map((raw) => ({
      line: Number(raw.line),
      plabel: raw.plabel ?? null,
      tag: raw.tag,
      // numeric(28,4) may arrive as a string; coerce for formatting.
      value: raw.value === null || raw.value === undefined ? null : Number(raw.value),
      uom: raw.uom,
      qtrs: Number(raw.qtrs),
      ddate: String(raw.ddate),
      stmt: raw.stmt as StatementCode,
    })) as RawLineItem[];
  })();

  lineItemsInflight.set(adsh, p);
  try {
    const rows = await p;
    lineItemsCache.set(adsh, rows);
    return rows;
  } finally {
    lineItemsInflight.delete(adsh);
  }
}

/**
 * Full income statement, balance sheet, and cash flow for one filing, grouped
 * by statement and split into main vs. share-data rows. Reuses the shared
 * per-filing row cache, so opening the Statements tab is instant once the
 * Overview (or a prior visit) has loaded that filing.
 */
export async function getStatements(adsh: string): Promise<Statements> {
  const rows = await fetchLineItems(adsh);
  return groupStatements(rows);
}

/**
 * Per-year Overview metrics for a company, one row per annual filing,
 * reconstructed from each filing's statements. Sorted oldest -> newest.
 */
export async function getAnnualOverview(cik: number): Promise<AnnualOverview[]> {
  const filings = await getFilings(cik);
  const annual = filings.filter((f) => ANNUAL_FORMS.has(f.form));
  if (annual.length === 0) return [];

  const perFiling = await Promise.all(
    annual.map(async (f) => {
      const rows = await fetchLineItems(f.adsh);
      return buildAnnualOverview(f, rows);
    })
  );

  const byYear = new Map<number, AnnualOverview>();
  for (const o of perFiling) {
    if (o && !byYear.has(o.year)) byYear.set(o.year, o);
  }
  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}

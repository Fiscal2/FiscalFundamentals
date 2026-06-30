import { supabase } from './supabase';
import { cikToTicker, loadTickerData } from './tickers';
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
  groupStatements,
  buildAnnualOverview,
} from './xbrl';

// Data access for the SEC fundamentals warehouse. This module owns *where rows
// come from* (Supabase queries + per-session caching); turning rows into
// statements and metrics lives in the pure `./xbrl` module.

const PAGE_SIZE = 1000;

// PostgREST caps every response at a fixed number of rows (1000 by default), and
// it does so silently — no error. Any query that can exceed that must page with
// `.range()` or it will quietly drop data. This pages until a short page comes
// back. `buildPage` must apply a deterministic (total) ordering so rows don't
// shift between page requests.
async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

// Shapes of the raw rows returned by the line-item queries below, before xbrl
// normalization. Columns can arrive as strings (numeric(28,4)) so widen those.
type LineQueryRow = {
  stmt: string;
  line: number | string;
  plabel: string | null;
  tag: string;
  value: number | string | null;
  uom: string;
  qtrs: number | string;
  ddate: string;
};
type AnnualQueryRow = LineQueryRow & {
  adsh: string;
  form: string;
  period: string | null;
  fy: number | null;
  fp: string | null;
  filed: string | null;
};

// --- Company search list ---

// The search list rarely changes (only when a new quarter is ingested), but it
// requires paging the whole `filing` table. Cache it in localStorage so a page
// refresh shows the search immediately instead of waiting on ~12 round-trips,
// and dedupe concurrent callers within a session via a shared in-flight promise.
const COMPANIES_CACHE_KEY = 'ff:companies:v2';
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
  // Load the ticker map first; the sync cikToTicker() returns null until it's
  // ready, which would otherwise fall back to showing a CIK as the ticker.
  await loadTickerData().catch(() => {});

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

  const p = fetchAllRows<FilingMeta>((from, to) =>
    supabase
      .from('filing')
      .select('adsh, form, period, fy, fp, filed')
      .eq('cik', cik)
      .order('period', { ascending: false, nullsFirst: false })
      .order('filed', { ascending: false })
      .order('adsh', { ascending: true })
      .range(from, to)
  );

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
    const data = await fetchAllRows<LineQueryRow>((from, to) =>
      supabase
        .from('line_item')
        .select('stmt, line, plabel, tag, value, uom, qtrs, ddate')
        .eq('adsh', adsh)
        .in('stmt', STATEMENT_CODES)
        .order('line')
        .order('ddate')
        .order('tag')
        .order('uom')
        .order('qtrs')
        .range(from, to)
    );

    return data.map((raw) => ({
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
 * Synchronous cache peeks for the Statements tab. The Overview prewarms the
 * filings list and annual line items, so a switch to Statements can usually
 * paint on the first render. Returns null on a miss; the caller then falls back
 * to the async `getFilings` / `getStatements` path.
 */
export function peekFilings(cik: number): FilingMeta[] | null {
  return filingsCache.get(cik) ?? null;
}

export function peekStatements(adsh: string): Statements | null {
  const rows = lineItemsCache.get(adsh);
  return rows ? groupStatements(rows) : null;
}

/**
 * Per-year Overview metrics for a company, one row per annual filing,
 * reconstructed from each filing's statements. Sorted oldest -> newest.
 *
 * Single round trip: the `annual_line_items` view joins `filing` + `line_item`,
 * so every annual filing's rows arrive in one request keyed by `cik` — instead
 * of a `filing` query followed by a dependent per-filing `line_item` query.
 * Rows are also written into the shared per-adsh cache so the Statements tab
 * stays instant once the Overview has loaded.
 */
export async function getAnnualOverview(cik: number): Promise<AnnualOverview[]> {
  // Warm the full filings list in the background (parallel, non-blocking) so the
  // Statements tab's filing picker is ready without its own round trip. The
  // annual view only carries annual forms, so the picker still needs this.
  void getFilings(cik).catch(() => {});

  const data = await fetchAllRows<AnnualQueryRow>((from, to) =>
    supabase
      .from('annual_line_items')
      .select('adsh, form, period, fy, fp, filed, stmt, line, plabel, tag, value, uom, qtrs, ddate')
      .eq('cik', cik)
      .in('stmt', STATEMENT_CODES)
      .order('line')
      .order('ddate')
      .order('adsh')
      .order('tag')
      .order('uom')
      .order('qtrs')
      .range(from, to)
  );

  if (data.length === 0) return [];

  // Group the flat result back into one bundle per filing.
  const byAdsh = new Map<string, { filing: FilingMeta; rows: RawLineItem[] }>();
  for (const raw of data) {
    const adsh = String(raw.adsh);
    let entry = byAdsh.get(adsh);
    if (!entry) {
      entry = {
        filing: {
          adsh,
          form: raw.form,
          period: raw.period ?? null,
          fy: raw.fy ?? null,
          fp: raw.fp ?? null,
          filed: raw.filed ?? null,
        },
        rows: [],
      };
      byAdsh.set(adsh, entry);
    }
    entry.rows.push({
      line: Number(raw.line),
      plabel: raw.plabel ?? null,
      tag: raw.tag,
      // numeric(28,4) may arrive as a string; coerce for formatting.
      value: raw.value === null || raw.value === undefined ? null : Number(raw.value),
      uom: raw.uom,
      qtrs: Number(raw.qtrs),
      ddate: String(raw.ddate),
      stmt: raw.stmt as StatementCode,
    });
  }

  // Newest filing first so that when two filings report the same fiscal year,
  // dedup below keeps the most recent one (matches the old getFilings order).
  const entries = Array.from(byAdsh.values()).sort(
    (a, b) =>
      (b.filing.period ?? '').localeCompare(a.filing.period ?? '') ||
      (b.filing.filed ?? '').localeCompare(a.filing.filed ?? '')
  );

  const byYear = new Map<number, AnnualOverview>();
  for (const { filing, rows } of entries) {
    // Warm the Statements-tab cache for this filing.
    if (!lineItemsCache.has(filing.adsh)) lineItemsCache.set(filing.adsh, rows);
    const o = buildAnnualOverview(filing, rows);
    if (o && !byYear.has(o.year)) byYear.set(o.year, o);
  }
  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}

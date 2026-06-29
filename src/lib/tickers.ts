// SEC ticker <-> CIK mapping, bundled from data/company_tickers_exchange.json
// (https://www.sec.gov/files/company_tickers_exchange.json). Lets the
// ticker-based search/URLs work against the warehouse, which is keyed by CIK.
import rawData from './data/company_tickers_exchange.json';

// Each row is [cik, name, ticker, exchange].
type TickerRow = [number, string, string, string | null];
const rows = (rawData as unknown as { fields: string[]; data: TickerRow[] }).data;

export type TickerInfo = { ticker: string; exchange: string | null; name: string };

let tickerToCikMap: Map<string, number> | null = null;
let cikToInfoMap: Map<number, TickerInfo> | null = null;

function build() {
  tickerToCikMap = new Map();
  cikToInfoMap = new Map();
  for (const [cik, name, ticker, exchange] of rows) {
    if (!ticker) continue;
    const t = ticker.toUpperCase();
    const c = Number(cik);
    tickerToCikMap.set(t, c);
    // Keep the first listing seen as the primary ticker for a CIK.
    if (!cikToInfoMap.has(c)) {
      cikToInfoMap.set(c, { ticker: t, exchange: exchange ?? null, name });
    }
  }
}

export function tickerToCik(ticker: string): number | null {
  if (!tickerToCikMap) build();
  return tickerToCikMap!.get(ticker.trim().toUpperCase()) ?? null;
}

export function cikToTicker(cik: number): TickerInfo | null {
  if (!cikToInfoMap) build();
  return cikToInfoMap!.get(Number(cik)) ?? null;
}

// --- Proper-casing for stylized (camelCase) company names ---
//
// SEC filing names are usually ALL CAPS, which naive title-casing renders as
// e.g. "Blackrock". The ticker file, however, stores the correct casing for
// hundreds of camelCase brands ("BlackRock", "PayPal", ...). We harvest the
// dominant clean-camelCase spelling of each token so the UI can restore it.
// CLEAN_CAMEL intentionally skips non-standard stylizations (e.g. "BlockchAIn",
// "iMAGE", "AIxCrypto") so ordinary words are never mangled.
const CLEAN_CAMEL = /^[A-Za-z][a-z]*([A-Z][a-z]+)+$/;
const stripEnds = (w: string) => w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.&]+$/g, '');

let tokenCaseMap: Map<string, string> | null = null;

function buildTokenCase() {
  const formCounts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const name = row[1];
    if (!name) continue;
    for (const raw of name.split(/\s+/)) {
      const word = stripEnds(raw);
      if (!word || !/[a-z][A-Z]/.test(word) || !CLEAN_CAMEL.test(word)) continue;
      const key = word.toLowerCase();
      let forms = formCounts.get(key);
      if (!forms) {
        forms = new Map();
        formCounts.set(key, forms);
      }
      forms.set(word, (forms.get(word) ?? 0) + 1);
    }
  }
  // Keep the most common spelling for each token.
  tokenCaseMap = new Map();
  for (const [key, forms] of formCounts) {
    let best = '';
    let bestCount = -1;
    for (const [form, count] of forms) {
      if (count > bestCount) {
        best = form;
        bestCount = count;
      }
    }
    tokenCaseMap.set(key, best);
  }
}

/**
 * Canonical camelCase spelling of a single name token (e.g. "blackrock" ->
 * "BlackRock") if the SEC ticker data knows one, else null.
 */
export function properCaseToken(word: string): string | null {
  if (!tokenCaseMap) buildTokenCase();
  const key = stripEnds(word).toLowerCase();
  return tokenCaseMap!.get(key) ?? null;
}

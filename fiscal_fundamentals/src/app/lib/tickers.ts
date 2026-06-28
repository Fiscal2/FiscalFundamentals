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

export type StockItem = {
  ticker: string;
  companyName: string;
  listedExchange?: string[] | null;
};

export type MenuItem = {
  title: string;
  path: string;
};

// --- SEC fundamentals warehouse: full statements (line_item) ---

export type StatementCode = 'IS' | 'BS' | 'CF';

export interface LineItemRow {
  line: number;
  plabel: string | null;
  tag: string;
  value: number | null;
  uom: string;
  qtrs: number;
  ddate: string; // ISO 'YYYY-MM-DD'
}

export interface FilingMeta {
  adsh: string;
  form: string;
  period: string | null;
  fy: number | null;
  fp: string | null;
  filed: string | null;
}

// One statement split into its main rows and the share/per-share
// parentheticals (rendered separately so colliding line numbers on the
// balance sheet don't interleave).
export interface StatementSection {
  rows: LineItemRow[];
  shareRows: LineItemRow[];
}

export type Statements = Record<StatementCode, StatementSection>;

// Derived per-year metrics for the dashboard Overview, reconstructed from the
// full `line_item` statements of each annual (10-K) filing.
export interface AnnualOverview {
  year: number;
  // Income statement
  revenue: number | null;
  operatingExpense: number | null;
  netIncome: number | null;
  netProfitMargin: number | null; // percent
  eps: number | null;
  effectiveTaxRate: number | null; // percent
  // Balance sheet
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  cashAndShortTermInvestments: number | null;
  bookValuePerShare: number | null;
  // Cash flow
  operatingCashFlow: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  netChangeInCash: number | null;
  freeCashFlow: number | null;
}
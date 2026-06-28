import { supabase } from './supabase';
import { cikToTicker } from './tickers';
import {
  StockItem,
  StatementCode,
  LineItemRow,
  FilingMeta,
  Statements,
  AnnualOverview,
} from './types';

// The five standardized fields exposed by the warehouse `fundamentals` view.
export type CanonicalField =
  | 'revenue'
  | 'operating_expenses'
  | 'net_income'
  | 'total_assets'
  | 'operating_cash_flow';

// Annual (duration) fields use qtrs=4; total_assets is an instant (qtrs=0).
const ANNUAL_FIELDS = new Set<CanonicalField>([
  'revenue',
  'net_income',
  'operating_expenses',
  'operating_cash_flow',
]);

export interface YearFacts {
  year: number;
  revenue: number | null;
  net_income: number | null;
  operating_expenses: number | null;
  total_assets: number | null;
  operating_cash_flow: number | null;
}

const PAGE_SIZE = 1000;

/**
 * Distinct companies present in the warehouse, enriched with ticker/exchange
 * from the SEC map. Drives the search list so users only pick companies that
 * actually have data loaded.
 */
export async function getCompanies(): Promise<StockItem[]> {
  const seen = new Map<number, StockItem>();
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('fundamentals')
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
 * All canonical facts for one company, reshaped into one row per fiscal year.
 * Missing fields stay null (the UI renders them as "-").
 */
export async function getCompanyFacts(cik: number): Promise<YearFacts[]> {
  const { data, error } = await supabase
    .from('fundamentals')
    .select('field, ddate, qtrs, value')
    .eq('cik', cik);

  if (error) throw error;
  const rows = data ?? [];

  // Annual period-end dates (from qtrs=4 facts) anchor each fiscal year and
  // identify which instant balance sheet (qtrs=0) belongs to the annual
  // report -- otherwise a later 10-Q's instant total_assets in the same
  // calendar year could overwrite the annual figure.
  const annualDates = new Set<string>();
  for (const row of rows) {
    if (Number(row.qtrs) === 4) annualDates.add(String(row.ddate));
  }

  const byYear = new Map<number, YearFacts>();
  const ensure = (year: number): YearFacts => {
    let y = byYear.get(year);
    if (!y) {
      y = {
        year,
        revenue: null,
        net_income: null,
        operating_expenses: null,
        total_assets: null,
        operating_cash_flow: null,
      };
      byYear.set(year, y);
    }
    return y;
  };

  for (const row of rows) {
    const field = row.field as CanonicalField;
    const ddate = String(row.ddate);
    const year = parseInt(ddate.slice(0, 4), 10);
    if (isNaN(year)) continue;

    const qtrs = Number(row.qtrs);
    if (field === 'total_assets') {
      // Instant; only the balance sheet tied to an annual period end.
      if (qtrs !== 0 || !annualDates.has(ddate)) continue;
    } else if (ANNUAL_FIELDS.has(field)) {
      if (qtrs !== 4) continue;
    } else {
      continue; // ignore any field outside the canonical set
    }

    // numeric(28,4) may arrive as a string; coerce to Number for formatting.
    const value =
      row.value === null || row.value === undefined ? null : Number(row.value);
    ensure(year)[field] = value;
  }

  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}

/**
 * Filings for a company (most recent first), used to drive the statement
 * filing picker.
 */
export async function getFilings(cik: number): Promise<FilingMeta[]> {
  const { data, error } = await supabase
    .from('filing')
    .select('adsh, form, period, fy, fp, filed')
    .eq('cik', cik)
    .order('period', { ascending: false, nullsFirst: false })
    .order('filed', { ascending: false });

  if (error) throw error;
  return (data ?? []) as FilingMeta[];
}

const STATEMENT_CODES: StatementCode[] = ['IS', 'BS', 'CF'];

// Per-share / share-count parentheticals. On the balance sheet these collide
// (by `line`) with the asset rows, so we render them in a separate block.
const PARENTHETICAL_LABEL = /\(in dollars per share\)|\(in shares\)/i;

function isShareRow(r: LineItemRow): boolean {
  return r.uom === 'shares' || (!!r.plabel && PARENTHETICAL_LABEL.test(r.plabel));
}

/**
 * Instant (qtrs=0) balances on the CF/EQ are stored at BOTH the period
 * beginning and end ddate, yielding duplicate rows per line. Collapse each
 * line to a single value: "beginning"-labelled rows keep the earliest ddate,
 * everything else keeps the latest. Rows that differ by label (e.g. BS cash
 * vs. par value sharing a line) are not merged.
 */
function collapseInstantEndpoints(rows: LineItemRow[]): LineItemRow[] {
  const groups = new Map<string, LineItemRow[]>();
  const result: LineItemRow[] = [];

  for (const r of rows) {
    if (r.qtrs !== 0) {
      result.push(r);
      continue;
    }
    const key = `${r.line}|${r.plabel ?? r.tag}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const sorted = [...group].sort((a, b) => a.ddate.localeCompare(b.ddate));
    const isBeginning = (sorted[0].plabel ?? '').toLowerCase().includes('begin');
    result.push(isBeginning ? sorted[0] : sorted[sorted.length - 1]);
  }

  return result.sort((a, b) => a.line - b.line || a.ddate.localeCompare(b.ddate));
}

/**
 * Full income statement, balance sheet, and cash flow for one filing,
 * grouped by statement and split into main vs. share-data rows.
 */
export async function getStatements(adsh: string): Promise<Statements> {
  const { data, error } = await supabase
    .from('line_item')
    .select('stmt, line, plabel, tag, value, uom, qtrs, ddate')
    .eq('adsh', adsh)
    .in('stmt', STATEMENT_CODES)
    .order('line')
    .order('ddate');

  if (error) throw error;

  const out: Statements = {
    IS: { rows: [], shareRows: [] },
    BS: { rows: [], shareRows: [] },
    CF: { rows: [], shareRows: [] },
  };

  const byCode: Record<StatementCode, LineItemRow[]> = { IS: [], BS: [], CF: [] };

  for (const raw of data ?? []) {
    const code = raw.stmt as StatementCode;
    if (!byCode[code]) continue;
    byCode[code].push({
      line: Number(raw.line),
      plabel: raw.plabel ?? null,
      tag: raw.tag,
      // numeric(28,4) may arrive as a string; coerce for formatting.
      value: raw.value === null || raw.value === undefined ? null : Number(raw.value),
      uom: raw.uom,
      qtrs: Number(raw.qtrs),
      ddate: String(raw.ddate),
    });
  }

  for (const code of STATEMENT_CODES) {
    const collapsed = collapseInstantEndpoints(byCode[code]);
    for (const r of collapsed) {
      if (isShareRow(r)) out[code].shareRows.push(r);
      else out[code].rows.push(r);
    }
  }

  return out;
}

// --- Overview: per-year metrics derived from the full statements ---
//
// `line_item.tag` is the bare XBRL tag (namespace lives in `version`), so we
// match on namespace-stripped tag names. These mirror the metrics the original
// dashboard surfaced, but are now read off the assembled statements instead of
// heuristically parsed raw XBRL.

const REVENUE_TAGS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'Revenues',
  'RevenuesNetOfInterestExpense',
  'SalesRevenueNet',
  'SalesRevenueServicesNet',
];
const NET_INCOME_TAGS = [
  'NetIncomeLoss',
  'ProfitLoss',
  'NetIncomeLossAvailableToCommonStockholdersBasic',
];
const EPS_TAGS = [
  'EarningsPerShareBasic',
  'EarningsPerShareBasicAndDiluted',
  'IncomeLossFromContinuingOperationsPerBasicShare',
];
const INCOME_TAX_TAGS = ['IncomeTaxExpenseBenefit', 'CurrentIncomeTaxExpenseBenefit'];
const PRETAX_INCOME_TAGS = [
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxes',
];
const OPEX_TOTAL_TAGS = [
  'OperatingExpenses',
  'CostsAndExpenses',
  'OperatingCostsAndExpenses',
  'NoninterestExpense',
];
const OPEX_COMPONENT_TAGS = [
  'SellingGeneralAndAdministrativeExpense',
  'SellingAndMarketingExpense',
  'GeneralAndAdministrativeExpense',
  'MarketingAndAdvertisingExpense',
  'ResearchAndDevelopmentExpense',
  'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost',
  'RestructuringCharges',
  'RestructuringSettlementAndImpairmentProvisions',
  'AmortizationOfIntangibleAssets',
  'OtherOperatingIncomeExpenseNet',
  'OtherCostAndExpenseOperating',
];

const ASSETS_TAGS = ['Assets'];
const LIABILITIES_TAGS = ['Liabilities'];
const EQUITY_TAGS = [
  'StockholdersEquity',
  'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
];
const PREFERRED_EQUITY_TAGS = ['PreferredStockValue'];
const COMPREHENSIVE_CASH_TAG = 'CashCashEquivalentsAndShortTermInvestments';
const CASH_TAGS = [
  'CashAndCashEquivalentsAtCarryingValue',
  'CashAndCashEquivalents',
  'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
  COMPREHENSIVE_CASH_TAG,
  'Cash',
];
const STI_TAGS = [
  'ShortTermInvestments',
  'OtherShortTermInvestments',
  'MarketableSecuritiesCurrent',
  'AvailableForSaleSecuritiesCurrent',
  'AvailableForSaleSecuritiesDebtSecuritiesCurrent',
  'TradingSecuritiesCurrent',
  'DebtSecuritiesAvailableForSaleCurrent',
  'EquitySecuritiesFvNi',
  'MarketableSecurities',
];
const SHARES_OUTSTANDING_TAGS = [
  'CommonStockSharesOutstanding',
  'CommonStockSharesIssued',
  'WeightedAverageNumberOfSharesOutstandingBasic',
  'WeightedAverageNumberOfDilutedSharesOutstanding',
];

const OPERATING_CF_TAGS = [
  'NetCashProvidedByUsedInOperatingActivities',
  'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
];
const INVESTING_CF_TAGS = [
  'NetCashProvidedByUsedInInvestingActivities',
  'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations',
];
const FINANCING_CF_TAGS = [
  'NetCashProvidedByUsedInFinancingActivities',
  'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations',
];
const NET_CHANGE_TAGS = [
  'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect',
  'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseExcludingExchangeRateEffect',
  'CashAndCashEquivalentsPeriodIncreaseDecrease',
];
const CAPEX_OUTFLOW_TAGS = [
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'PaymentsToAcquireProductiveAssets',
  'PaymentsForCapitalImprovements',
  'PaymentsToAcquireOtherPropertyPlantAndEquipment',
  'PaymentsToAcquireMachineryAndEquipment',
  'PaymentsToAcquireBuildings',
];
const CAPEX_PROCEEDS_TAGS = [
  'ProceedsFromSaleOfPropertyPlantAndEquipment',
  'ProceedsFromSaleOfProductiveAssets',
  'ProceedsFromDisposalOfPropertyPlantAndEquipment',
];

// line_item row plus its statement code, used only while deriving the overview.
type OverviewRow = LineItemRow & { stmt: StatementCode };

// Build a tag -> value map for rows passing `keep` (lowest line wins).
function buildTagMap(rows: OverviewRow[], keep: (r: OverviewRow) => boolean): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.value === null || !keep(r)) continue;
    if (!m.has(r.tag)) m.set(r.tag, r.value);
  }
  return m;
}

function pickTag(m: Map<string, number>, tags: string[]): number | null {
  for (const t of tags) {
    const v = m.get(t);
    if (typeof v === 'number') return v;
  }
  return null;
}

function sumTags(m: Map<string, number>, tags: string[]): number | null {
  let sum = 0;
  let found = false;
  for (const t of tags) {
    const v = m.get(t);
    if (typeof v === 'number') {
      sum += v;
      found = true;
    }
  }
  return found ? sum : null;
}

function buildAnnualOverview(filing: FilingMeta, rows: OverviewRow[]): AnnualOverview | null {
  const yearStr = (filing.period ?? '').slice(0, 4);
  let year = parseInt(yearStr, 10);
  if (isNaN(year)) {
    const ddates = rows.filter((r) => r.qtrs === 4).map((r) => r.ddate);
    if (ddates.length === 0) return null;
    year = parseInt(ddates.sort().at(-1)!.slice(0, 4), 10);
  }
  if (isNaN(year)) return null;

  const is = buildTagMap(rows, (r) => r.stmt === 'IS' && r.qtrs === 4);
  const bs = buildTagMap(rows, (r) => r.stmt === 'BS' && r.qtrs === 0);
  const cf = buildTagMap(rows, (r) => r.stmt === 'CF' && r.qtrs === 4);

  const revenue = pickTag(is, REVENUE_TAGS);
  const netIncome = pickTag(is, NET_INCOME_TAGS);
  const eps = pickTag(is, EPS_TAGS);
  const incomeTax = pickTag(is, INCOME_TAX_TAGS);
  const preTaxIncome = pickTag(is, PRETAX_INCOME_TAGS);

  let operatingExpense = pickTag(is, OPEX_TOTAL_TAGS);
  if (operatingExpense === null) operatingExpense = sumTags(is, OPEX_COMPONENT_TAGS);

  const netProfitMargin =
    revenue && netIncome !== null ? (netIncome / revenue) * 100 : null;
  const effectiveTaxRate =
    incomeTax !== null && preTaxIncome !== null && preTaxIncome !== 0
      ? (incomeTax / preTaxIncome) * 100
      : null;

  const totalAssets = pickTag(bs, ASSETS_TAGS);
  let totalEquity = pickTag(bs, EQUITY_TAGS);
  const explicitLiabilities = pickTag(bs, LIABILITIES_TAGS);

  if (totalEquity === null && totalAssets !== null && explicitLiabilities !== null) {
    totalEquity = totalAssets - explicitLiabilities;
  }
  let totalLiabilities: number | null;
  if (explicitLiabilities !== null) totalLiabilities = explicitLiabilities;
  else if (totalAssets !== null && totalEquity !== null) totalLiabilities = totalAssets - totalEquity;
  else totalLiabilities = null;

  const cash = pickTag(bs, CASH_TAGS) ?? 0;
  const usedComprehensiveCash = bs.get(COMPREHENSIVE_CASH_TAG) !== undefined &&
    CASH_TAGS.find((t) => bs.get(t) !== undefined) === COMPREHENSIVE_CASH_TAG;
  const sti = usedComprehensiveCash ? 0 : sumTags(bs, STI_TAGS) ?? 0;
  const cashAndShortTermInvestments = pickTag(bs, CASH_TAGS) === null && sti === 0 ? null : cash + sti;

  const preferredEquity = pickTag(bs, PREFERRED_EQUITY_TAGS) ?? 0;
  const sharesOutstanding = pickTag(bs, SHARES_OUTSTANDING_TAGS) ?? pickTag(is, SHARES_OUTSTANDING_TAGS);
  const bookValuePerShare =
    totalEquity !== null && sharesOutstanding !== null && sharesOutstanding > 0
      ? (totalEquity - preferredEquity) / sharesOutstanding
      : null;

  const operatingCashFlow = pickTag(cf, OPERATING_CF_TAGS);
  const investingCashFlow = pickTag(cf, INVESTING_CF_TAGS);
  const financingCashFlow = pickTag(cf, FINANCING_CF_TAGS);
  const netChangeInCash = pickTag(cf, NET_CHANGE_TAGS);

  const capexOutflow = sumTags(cf, CAPEX_OUTFLOW_TAGS);
  const capexProceeds = sumTags(cf, CAPEX_PROCEEDS_TAGS);
  const netCapex =
    capexOutflow !== null || capexProceeds !== null
      ? Math.abs((capexOutflow ?? 0) - (capexProceeds ?? 0))
      : null;
  const freeCashFlow =
    operatingCashFlow !== null && netCapex !== null ? operatingCashFlow - netCapex : null;

  return {
    year,
    revenue,
    operatingExpense,
    netIncome,
    netProfitMargin,
    eps,
    effectiveTaxRate,
    totalAssets,
    totalLiabilities,
    totalEquity,
    cashAndShortTermInvestments,
    bookValuePerShare,
    operatingCashFlow,
    investingCashFlow,
    financingCashFlow,
    netChangeInCash,
    freeCashFlow,
  };
}

/**
 * Per-year Overview metrics for a company, one row per annual (10-K) filing,
 * reconstructed from that filing's full statements. Sorted oldest -> newest.
 */
export async function getAnnualOverview(cik: number): Promise<AnnualOverview[]> {
  const filings = await getFilings(cik);
  const annual = filings.filter((f) => f.form === '10-K');
  if (annual.length === 0) return [];

  const perFiling = await Promise.all(
    annual.map(async (f) => {
      const { data, error } = await supabase
        .from('line_item')
        .select('stmt, line, tag, value, uom, qtrs, ddate')
        .eq('adsh', f.adsh)
        .in('stmt', STATEMENT_CODES)
        .order('line')
        .order('ddate');
      if (error) throw error;

      const rows: OverviewRow[] = (data ?? []).map((raw) => ({
        line: Number(raw.line),
        plabel: null,
        tag: raw.tag,
        value: raw.value === null || raw.value === undefined ? null : Number(raw.value),
        uom: raw.uom,
        qtrs: Number(raw.qtrs),
        ddate: String(raw.ddate),
        stmt: raw.stmt as StatementCode,
      }));

      return buildAnnualOverview(f, rows);
    })
  );

  const byYear = new Map<number, AnnualOverview>();
  for (const o of perFiling) {
    if (o && !byYear.has(o.year)) byYear.set(o.year, o);
  }
  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}

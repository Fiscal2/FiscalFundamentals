// XBRL interpretation: the pure core that turns raw `line_item` rows into
// assembled statements and per-year Overview metrics. It has no knowledge of
// where the rows come from (Supabase, a fixture, a precompute job) — callers
// hand it rows, it hands back meaning. Keeping this seam pure makes it the test
// surface for the warehouse's most bug-prone logic (tag matching, GAAP vs IFRS,
// the derivation fallbacks) without touching the network.

import {
  StatementCode,
  LineItemRow,
  FilingMeta,
  Statements,
  AnnualOverview,
  CanonicalYearFacts,
} from './types';

// A line_item row plus its statement code. The unit the interpreter operates on.
export type RawLineItem = LineItemRow & { stmt: StatementCode };

export const STATEMENT_CODES: StatementCode[] = ['IS', 'BS', 'CF'];

// Annual-report forms: US domestic (10-K) plus foreign private issuers (20-F)
// and Canadian filers under MJDS (40-F). All carry full-year duration facts
// (qtrs=4) and a year-end balance sheet, so buildAnnualOverview handles them
// identically.
export const ANNUAL_FORMS = new Set(['10-K', '20-F', '40-F']);

// --- Statement assembly ---

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
 * Group flat line_item rows into per-statement blocks, splitting share-data
 * rows out and collapsing duplicate instant endpoints. Pure and cheap.
 */
export function groupStatements(rows: RawLineItem[]): Statements {
  const out: Statements = {
    IS: { rows: [], shareRows: [] },
    BS: { rows: [], shareRows: [] },
    CF: { rows: [], shareRows: [] },
  };

  const byCode: Record<StatementCode, LineItemRow[]> = { IS: [], BS: [], CF: [] };
  for (const r of rows) {
    if (byCode[r.stmt]) byCode[r.stmt].push(r);
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
// match across taxonomies on namespace-stripped names. Each metric lists its
// US-GAAP tags first, then the IFRS (`ifrs-full`) equivalents used by foreign
// private issuers (20-F filers like Spotify); US-GAAP wins when a filer reports
// both.
const REVENUE_TAGS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'Revenues',
  'RevenuesNetOfInterestExpense',
  'SalesRevenueNet',
  'SalesRevenueServicesNet',
  // Regulated utilities (e.g. Sempra) report total revenue on the income
  // statement face under these instead of a generic Revenues tag.
  'RegulatedAndUnregulatedOperatingRevenue',
  'RegulatedOperatingRevenue',
  // IFRS
  'Revenue',
  'RevenueFromContractsWithCustomers',
];
const NET_INCOME_TAGS = [
  'NetIncomeLoss',
  'ProfitLoss',
  'NetIncomeLossAvailableToCommonStockholdersBasic',
  // IFRS
  'ProfitLossAttributableToOwnersOfParent',
];
const EPS_TAGS = [
  'EarningsPerShareBasic',
  'EarningsPerShareBasicAndDiluted',
  'EarningsPerShareDiluted',
  'IncomeLossFromContinuingOperationsPerBasicShare',
  // IFRS
  'BasicEarningsLossPerShare',
  'BasicEarningsLossPerShareFromContinuingOperations',
];
const INCOME_TAX_TAGS = [
  'IncomeTaxExpenseBenefit',
  'CurrentIncomeTaxExpenseBenefit',
  // IFRS
  'IncomeTaxExpenseContinuingOperations',
];
const PRETAX_INCOME_TAGS = [
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxes',
  // IFRS
  'ProfitLossBeforeTax',
];
const OPEX_TOTAL_TAGS = [
  'OperatingExpenses',
  'CostsAndExpenses',
  'OperatingCostsAndExpenses',
  'NoninterestExpense',
  'MarketingAdministrationAndResearchCosts',
  'OtherCostOfOperatingRevenue',
  // IFRS
  'OperatingExpense',
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
  // IFRS
  'Equity',
  'EquityAttributableToOwnersOfParent',
];
const EQUITY_BEFORE_TREASURY_TAG = 'StockholdersEquityBeforeTreasuryStock';
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
  'WeightedAverageNumberOfSharesOutstandingBasic',
  'WeightedAverageNumberOfDilutedSharesOutstanding',
  // IFRS
  'NumberOfSharesOutstanding',
  'WeightedAverageShares',
  'AdjustedWeightedAverageShares',
];
const SHARES_ISSUED_TAGS = ['CommonStockSharesIssued', 'NumberOfSharesIssued'];
const TREASURY_SHARES_TAGS = ['TreasuryStockCommonShares', 'TreasuryStockShares'];

const OPERATING_CF_TAGS = [
  'NetCashProvidedByUsedInOperatingActivities',
  'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  // IFRS
  'CashFlowsFromUsedInOperatingActivities',
];
const INVESTING_CF_TAGS = [
  'NetCashProvidedByUsedInInvestingActivities',
  'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations',
  // IFRS
  'CashFlowsFromUsedInInvestingActivities',
];
const FINANCING_CF_TAGS = [
  'NetCashProvidedByUsedInFinancingActivities',
  'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations',
  // IFRS
  'CashFlowsFromUsedInFinancingActivities',
];
const NET_CHANGE_TAGS = [
  'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect',
  'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseExcludingExchangeRateEffect',
  'CashAndCashEquivalentsPeriodIncreaseDecrease',
  // IFRS
  'IncreaseDecreaseInCashAndCashEquivalents',
  'IncreaseDecreaseInCashAndCashEquivalentsBeforeEffectOfExchangeRateChanges',
];
const CAPEX_OUTFLOW_TAGS = [
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'PaymentsToAcquireProductiveAssets',
  'PaymentsForCapitalImprovements',
  'PaymentsToAcquireOtherPropertyPlantAndEquipment',
  'PaymentsToAcquireMachineryAndEquipment',
  'PaymentsToAcquireBuildings',
  // IFRS
  'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
  'PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities',
  'PurchaseOfPropertyPlantAndEquipmentIntangibleAssetsOtherThanGoodwillInvestmentPropertyAndOtherNoncurrentAssets',
  'PurchaseOfOtherLongtermAssetsClassifiedAsInvestingActivities',
];
const CAPEX_PROCEEDS_TAGS = [
  'ProceedsFromSaleOfPropertyPlantAndEquipment',
  'ProceedsFromSaleOfProductiveAssets',
  'ProceedsFromDisposalOfPropertyPlantAndEquipment',
  // IFRS
  'ProceedsFromSalesOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
];

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

export type OverviewRow = LineItemRow & { stmt: string };

function pickEquity(bs: Map<string, number>, eq: Map<string, number>): number | null {
  let equity = pickTag(bs, EQUITY_TAGS) ?? pickTag(eq, EQUITY_TAGS);
  if (equity !== null && equity < 0) {
    const beforeTreasury =
      pickTag(bs, [EQUITY_BEFORE_TREASURY_TAG]) ?? pickTag(eq, [EQUITY_BEFORE_TREASURY_TAG]);
    if (beforeTreasury !== null) equity = beforeTreasury;
  }
  return equity;
}

function pickShareCount(
  bs: Map<string, number>,
  is: Map<string, number>,
  netIncome: number | null,
  eps: number | null
): number | null {
  let shares = pickTag(bs, SHARES_OUTSTANDING_TAGS) ?? pickTag(is, SHARES_OUTSTANDING_TAGS);
  if (shares === null || shares <= 0) {
    const issued = pickTag(bs, SHARES_ISSUED_TAGS) ?? pickTag(is, SHARES_ISSUED_TAGS);
    const treasury = pickTag(bs, TREASURY_SHARES_TAGS);
    if (issued !== null && treasury !== null && issued > treasury) shares = issued - treasury;
    else if (issued !== null && treasury === null) shares = issued;
  }
  if ((shares === null || shares <= 0) && netIncome !== null && eps !== null && eps !== 0) {
    shares = netIncome / eps;
  }
  return shares !== null && shares > 0 ? shares : null;
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

/** Fact year from statement rows — when the numbers apply, not filing.fy/period. */
export function resolveFactYear(rows: RawLineItem[]): number | null {
  const ddates = rows.filter((r) => r.qtrs === 4).map((r) => r.ddate);
  const source = ddates.length > 0 ? ddates : rows.filter((r) => r.qtrs === 0).map((r) => r.ddate);
  if (source.length === 0) return null;
  const year = parseInt(source.sort().at(-1)!.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

/** Prefer warehouse canonical facts; keep line_item-derived values as fallback. */
export function mergeCanonicalFacts(
  overview: AnnualOverview,
  canonical: CanonicalYearFacts | undefined
): AnnualOverview {
  if (!canonical) return overview;

  const revenue = canonical.revenue ?? overview.revenue;
  const operatingExpense = canonical.operating_expenses ?? overview.operatingExpense;
  const netIncome = canonical.net_income ?? overview.netIncome;
  const totalAssets = canonical.total_assets ?? overview.totalAssets;
  const operatingCashFlow = canonical.operating_cash_flow ?? overview.operatingCashFlow;

  const netProfitMargin =
    revenue && netIncome !== null ? (netIncome / revenue) * 100 : overview.netProfitMargin;

  return {
    ...overview,
    revenue,
    operatingExpense,
    netIncome,
    totalAssets,
    operatingCashFlow,
    netProfitMargin,
  };
}

/**
 * Per-year Overview metrics for one annual filing, reconstructed from that
 * filing's full statement rows. Pure: hand it the filing meta and its rows.
 * Returns null when the fiscal year can't be determined.
 */
export function buildAnnualOverview(filing: FilingMeta, rows: OverviewRow[]): AnnualOverview | null {
  const year = resolveFactYear(rows as RawLineItem[]);
  if (year === null) return null;

  const is = buildTagMap(rows, (r) => r.stmt === 'IS' && r.qtrs === 4);
  const bs = buildTagMap(rows, (r) => r.stmt === 'BS' && r.qtrs === 0);
  const eq = buildTagMap(rows, (r) => r.stmt === 'EQ' && r.qtrs === 0);
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
  let totalEquity = pickEquity(bs, eq);
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
  const sharesOutstanding = pickShareCount(bs, is, netIncome, eps);
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

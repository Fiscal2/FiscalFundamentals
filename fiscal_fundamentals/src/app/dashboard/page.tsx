// src/app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, XAxisProps, YAxis, Legend, ResponsiveContainer, LabelList, LabelProps, ReferenceLine } from 'recharts';
import { useSearchParams } from 'next/navigation';
import { getTagValue } from '@/app/lib/xbrl';


interface FinancialRow {
  ticker: string;
  company_name?: string;
  listed_exchange?: string;
  year: number;
  quarter: number;
  income_statement: string;
  balance_sheet: string;
  cash_flow: string;
}

const formatDollars = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    compactDisplay: 'short',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

type ReportItem = {
  label: string;
  value: number;
};

interface IncomeReport {
  date: string;
  months: number;
  map: Record<string, ReportItem>;
}

const extractMetrics = (rawMap: Record<string, { label?: string; value?: number }>) => {
  let revenue = 0;
  let netIncome = 0;

  const revenueKeys = [
    'axp_TotalRevenuesNetOfInterestExpenseAfterProvisionsForLosses',
    'us-gaap_RevenuesNetOfInterestExpense',
    'us-gaap_Revenues',
    'us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax',
    'us-gaap_SalesRevenueNet',
    'us-gaap_SalesRevenueServicesNet',
  ];
  const incomeKeys = [
    'us-gaap_NetIncomeLoss',
    'us-gaap_ProfitLoss',
    'us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic',
    'ifrs-full_ProfitLoss',
    'ifrs-full_ProfitLossAttributableToOwnersOfParent'
  ];

  const normalizedEntries: [string, { label?: string; value?: number }][] =
    Object.entries(rawMap).map(([key, val]) => {
      const match = key.toLowerCase().match(/defref_(.*)/);
      const normKey = match ? match[1] : key.toLowerCase();
      return [normKey, val];
    });

  const findByKeys = (priorityKeys: string[]) => {
    for (const searchKey of priorityKeys.map(k => k.toLowerCase())) {
      const entry = normalizedEntries.find(([k]) => k === searchKey);
      if (entry) return entry[1];
    }
    return undefined;
  };

  const revMatch = findByKeys(revenueKeys);
  const niMatch = findByKeys(incomeKeys);

  if (revMatch) revenue = revMatch.value ?? 0;
  if (niMatch) netIncome = niMatch.value ?? 0;

  // Fallback to fuzzy label search
  if (!revenue) {
    for (const [, val] of normalizedEntries) {
      const label = val?.label?.toLowerCase() || '';
      if (
        label.includes('total net revenue') ||
        label.includes('net sales') ||
        label.includes('revenue') ||
        label.includes('total revenues')
      ) {
        revenue = val.value ?? revenue;
        break;
      }
    }
  }

  if (!netIncome) {
    for (const [, val] of normalizedEntries) {
      const label = val?.label?.toLowerCase() || '';
      if (
        label.includes('net income applicable') ||
        label.includes('net income') ||
        label.includes('net earnings') ||
        label.includes('net profit')
      ) {
        netIncome = val.value ?? netIncome;
        break;
      }
    }
  }

  return { revenue, netIncome };
};

export default function Dashboard() {
  const searchParams = useSearchParams();
  const initialTicker = searchParams.get('ticker');
  const [selected, setSelected] = useState<string | null>(initialTicker);

  const [data, setData] = useState<FinancialRow[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('http://localhost:8000/api/financials'); // use the actual API route
        const json = await res.json();
        //console.log('Fetched data:', json);

        if (Array.isArray(json)) {
          setData(json);
        } else {
          console.error('Unexpected API response:', json);
          setData([]);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    if (!selected) return;

    const companyData = data.filter(d => d.ticker === selected && d.quarter === 0);
    if (companyData.length === 0) return;

    const mostRecentYear = Math.max(...companyData.map(d => d.year));
    setSelectedYear(mostRecentYear);
  }, [selected, data]);

  useEffect(() => {
    const ticker = searchParams.get('ticker');
    if (ticker && ticker !== selected) {
      setSelected(ticker);
    }
  }, [searchParams, selected]);


  const chartData = data
    .filter(row => row.ticker === selected && row.quarter === 0)
    .map(row => {
      const parsed: IncomeReport[] = JSON.parse(row.income_statement);

      // Match report year from "date" field (format "DD-MM-YYYY")
      const matchedReport = parsed.find((r: IncomeReport) => {
        const parts = r.date?.split('-'); // e.g., "31-12-2021"
        return parts && parseInt(parts[2]) === row.year;
      });

      const report: Record<string, ReportItem> = matchedReport?.map ?? {};
      const { revenue, netIncome } = extractMetrics(report);

      return {
        year: row.year,
        revenue: revenue ?? 0,
        netIncome: netIncome ?? 0,
      };
    })
    .sort((a, b) => a.year - b.year);

  const balanceChartData = data
    .filter(row => row.ticker === selected && row.quarter === 0)
    .map(row => {
      const parsed: IncomeReport[] = JSON.parse(row.balance_sheet);

      const matchedReport = parsed.find((r: IncomeReport) => {
        const parts = r.date?.split('-');
        return parts && parseInt(parts[2]) === row.year;
      });

      const reportMap: Record<string, ReportItem> = matchedReport?.map ?? {};

      const totalAssets = getTagValue(reportMap, [
        'us-gaap_Assets'
      ]);
      // Try to read an explicit equity line first
      let totalEquity = getTagValue(reportMap, [
        "us-gaap_StockholdersEquity",
        "us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
      ]);

      // If there was no explicit equity line, derive it from assets & liabilities
      // (we don’t know liabilities yet, so we’ll compute equity after we get liabilities)
      const explicitLiabilities = getTagValue(reportMap, [
        'us-gaap_Liabilities'
      ]);

      // Fallback: if we don’t have equity but do have assets & liabilities, derive equity
      if (typeof totalEquity !== "number"
        && typeof totalAssets === "number"
        && typeof explicitLiabilities === "number"
      ) {
        totalEquity = totalAssets - explicitLiabilities;
      }

      // Now we can reliably compute liabilities: if we had an explicit liabilities
      // line, use that; otherwise derive it from assets & equity
      let totalLiabilities;
      if (typeof explicitLiabilities === "number") {
        totalLiabilities = explicitLiabilities;
      } else if (typeof totalAssets === "number" && typeof totalEquity === "number") {
        totalLiabilities = totalAssets - totalEquity;
      } else {
        totalLiabilities = null;
      }

      return {
        year: row.year,
        assets: totalAssets ?? 0,
        liabilities: totalLiabilities ?? 0,
        equity: totalEquity ?? 0,
      };
    })
    .sort((a, b) => a.year - b.year);

  const cashFlowChartData = data
    .filter(row => row.ticker === selected && row.quarter === 0)
    .map(row => {
      const parsed: IncomeReport[] = JSON.parse(row.cash_flow);

      const matchedReport = parsed.find((r: IncomeReport) => {
        const parts = r.date?.split('-');
        return parts && parseInt(parts[2]) === row.year;
      });

      const reportMap: Record<string, ReportItem> = matchedReport?.map ?? {};

      const netCashChange = getTagValue(
        reportMap, [
        'us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect',
        'us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseExcludingExchangeRateEffect',
        'us-gaap_CashAndCashEquivalentsPeriodIncreaseDecrease',
        'hsic_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffectContinuingOperations',
        'ifrs-full_IncreaseDecreaseInCashAndCashEquivalentsBeforeEffectOfExchangeRateChanges',
        'ifrs-full_IncreaseDecreaseInCashAndCashEquivalents'
      ]);

      return {
        year: row.year,
        netChange: netCashChange ?? 0,
      };
    })
    .sort((a, b) => a.year - b.year);


  const renderCustomBarLabel = (props: LabelProps) => {
    const { x, y, width, value } = props;

    // Convert to number
    const xPos = typeof x === 'number' ? x : parseFloat(x || '0');
    const yPos = typeof y === 'number' ? y : parseFloat(y || '0');
    const barWidth = typeof width === 'number' ? width : parseFloat(width || '0');

    if (typeof value !== 'number') return null;

    return (
      <text
        x={xPos + barWidth / 2}
        y={yPos - 6}
        fill="#FFFFFF"
        fontSize={15}
        className="font-bold"
        textAnchor="middle"
      >
        {formatDollars(value)}
      </text>
    );
  };

  type CustomTickProps = XAxisProps['tickFormatter'] & {
    x: number;
    y: number;
    payload: {
      value: number;
    };
    onClick: (year: number) => void;
    selectedYear: number | null;
  };

  const CustomXAxisTick = ({ x, y, payload, onClick }: CustomTickProps) => {
    const year = payload.value;
    const isSelected = selectedYear === year;
    const width = 50;
    const height = 30;
    const textYOffset = 22;

    return (
      <g transform={`translate(${x}, ${y})`} onClick={() => onClick(year)} style={{ cursor: 'pointer' }}>
        {isSelected && (
          <rect
            x={-width / 2}
            y={0}
            width={width}
            height={height}
            rx={4}
            ry={4}
            fill="#2563eb" // Tailwind blue-600
          />
        )}
        <text
          x={0}
          y={textYOffset}
          textAnchor="middle"
          fill={isSelected ? '#fff' : '#D3D3D3'}
          fontSize={18}
          fontWeight={isSelected ? 'bold' : 'normal'}
        >
          {year}
        </text>
      </g>
    );
  };

  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const toTitleCase = (str: string) => {
    const exceptions = ["PG&E", "HP", "EQT", "HCA", "EOG", "M&T", "KKR", "KLA", "MGM", "EPAM", "BIO-TECHNE", "PLC"]; // add more as needed

    return str
      .toLowerCase()
      .split(" ")
      .map(word => {
        const upperWord = word.toUpperCase();
        if (exceptions.includes(upperWord)) {
          return upperWord;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  };

  const rawCompanyName = data.find(d => d.ticker === selected)?.company_name || '';
  const rawListedExchange = data.find(d => d.ticker === selected)?.listed_exchange || '';
  const companyName = toTitleCase(rawCompanyName);
  const listedExchange = toTitleCase(rawListedExchange)

  return (
    <main className="p-8">
      <h1>{listedExchange.toUpperCase()}</h1>
      <h1 className="text-2xl font-bold mb-4">{companyName}</h1>

      {selected && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-2">Revenue vs Net Income for {selected}</h2>
          <div className="w-[95%] mx-auto">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={chartData}
                margin={{ top: 30, right: 30, left: 0, bottom: 0 }}
                onClick={(e) => {
                  if (e && e.activeLabel) {
                    const year = parseInt(e.activeLabel.toString(), 10);
                    if (!isNaN(year)) {
                      setSelectedYear(year);
                    }
                  }
                }}
              >
                <XAxis
                  dataKey="year"
                  axisLine={false}
                  tick={(props) => (
                    <CustomXAxisTick
                      {...props}
                      onClick={(year: number) => {
                        if (!isNaN(year)) {
                          setSelectedYear(year);
                        }
                      }}
                    />
                  )}
                />
                <YAxis tick={false} axisLine={false} domain={[(dataMin: number) => Math.min(0, dataMin) * 1.1, (dataMax: number) => dataMax * 1.1]} />
                <ReferenceLine y={0} stroke="#9CA3AF" />
                <Legend
                  content={() => (
                    <div className="flex justify-center gap-6 mt-4 text-sm">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-[#8884d8]"></div>
                        <span className="font-bold">Revenue</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-[#82ca9d]"></div>
                        <span className="font-bold">Net Income</span>
                      </div>
                    </div>
                  )}
                />
                <Bar dataKey="revenue" fill="#8884d8" name="Revenue" >
                  <LabelList content={renderCustomBarLabel} />
                </Bar>
                <Bar dataKey="netIncome" fill="#82ca9d" name="Net Income" >
                  <LabelList content={renderCustomBarLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {selectedYear && (
              <div className="mt-8 w-[95%] mx-auto">
                <details className="rounded-md p-4">
                  <summary className="cursor-pointer text-lg font-semibold mb-2">
                    Income Statement – {selectedYear}
                  </summary>
                  <div className="mt-4">
                    {(() => {
                      const selectedRow = data.find(
                        d => d.ticker === selected && d.year === selectedYear && d.quarter === 0
                      );
                      if (!selectedRow) return <p className="text-gray-500">No data available.</p>;

                      const parsed: IncomeReport[] = JSON.parse(selectedRow.income_statement);
                      const reportMap = parsed[0]?.map ?? {};


                      const { revenue, netIncome } = extractMetrics(reportMap);
                      const netProfitMargin = revenue ? (netIncome / revenue) * 100 : null;

                      // GAAP first, then IFRS fallback if you want
                      const incomeTaxVal = getTagValue(reportMap, [
                        'us-gaap_IncomeTaxExpenseBenefit',
                        'us-gaap_CurrentIncomeTaxExpenseBenefit',
                        'ifrs-full_IncomeTaxExpenseContinuingOperations',
                      ]);

                      const preTaxIncomeVal = getTagValue(reportMap, [
                        'us-gaap_IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
                        'us-gaap_IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
                        'us-gaap_IncomeLossIncludingPortionAttributableToNoncontrollingInterest',
                        'us-gaap_IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic',
                        'mcd_IncomeLossFromContinuingOperationsBeforeIncomeTaxes',
                        'pg_IncomeLossFromContinuingOperationsBeforeIncomeTaxes',
                        'ifrs-full_ProfitLossBeforeTax',
                      ]);

                      const effectiveTaxRate =
                        typeof incomeTaxVal === 'number' &&
                          typeof preTaxIncomeVal === 'number' &&
                          preTaxIncomeVal !== 0
                          ? (incomeTaxVal / preTaxIncomeVal) * 100
                          : null;

                      // 1) Prefer a direct total if the filer provides one
                      let operatingExpense = getTagValue(reportMap, [
                        'us-gaap_OperatingExpenses',      // generic total (not always present)
                        'us-gaap_NoninterestExpense',      // banks/financials use this as "operating expense"
                        'us-gaap_CostsAndExpenses',
                        'us-gaap_OperatingCostsAndExpenses'
                      ]);

                      // 2) Otherwise, build it from standard operating components
                      if (operatingExpense === null) {
                        // Core operating expense building blocks (SG&A + R&D)
                        const componentTags = [
                          // SG&A family
                          'us-gaap_SellingGeneralAndAdministrativeExpense',
                          'us-gaap_SellingAndMarketingExpense',          // sometimes split
                          'us-gaap_GeneralAndAdministrativeExpense',
                          'us-gaap_MarketingAndAdvertisingExpense',

                          // R&D
                          'us-gaap_ResearchAndDevelopmentExpense',
                          'us-gaap_ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost',
                          'us-gaap_ResearchAndDevelopmentInProcess',     // IPR&D charged to expense

                          // Common add-ons often included in operating expense
                          'us-gaap_AmortizationOfIntangibleAssets',
                          'us-gaap_RestructuringCharges',
                          'us-gaap_DepreciationDepletionAndAmortization',
                          'ibm_IntellectualPropertyAndCustomDevelopmentIncome',

                          // If the statement uses an operating "other" line:
                          'us-gaap_OtherOperatingIncomeExpenseNet',       // NOTE: exclude Nonoperating version

                        ];

                        let sum = 0;
                        let foundAny = false;

                        for (const tag of componentTags) {
                          const v = getTagValue(reportMap, [tag]);
                          if (typeof v === 'number') {
                            sum += v;
                            foundAny = true;
                          }
                        }

                        operatingExpense = foundAny ? sum : null;
                      }


                      const rows = [
                        { label: "Revenue", value: revenue },
                        { label: "Operating expense", value: Math.abs(operatingExpense ?? 0) },
                        { label: "Net income", value: netIncome },
                        { label: "Net profit margin", value: netProfitMargin },
                        {
                          label: "Earnings per share", value: getTagValue(reportMap, [
                            'us-gaap_EarningsPerShareBasic',
                            'us-gaap_IncomeLossFromContinuingOperationsPerBasicShare',
                            'us-gaap_EarningsPerShareBasicAndDiluted',
                            'ifrs-full_BasicEarningsLossPerShare'
                          ])
                        },
                        { label: "Effective tax rate", value: effectiveTaxRate },
                      ];

                      return (
                        <table className="w-full mt-4 text-sm border-t">
                          <thead>
                            <tr className="text-left text-gray-400 border-b">
                              <th className="py-2">(USD)</th>
                              <th className="py-2">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(({ label, value }) => (
                              <tr key={label} className="border-b">
                                <td className="py-2">{label}</td>
                                <td className="py-2 font-medium">
                                  {typeof value === 'number' ? (
                                    label === "Net profit margin" || label === "Effective tax rate"
                                      ? `${value.toFixed(2)}%`
                                      : label === "Earnings per share"
                                        ? `$${value.toFixed(2)}`
                                        : formatDollars(value)
                                  ) : (
                                    value ?? '—'
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </details>
              </div>
            )}
            {selectedYear && (
              <div className="w-[95%] mx-auto">
                <details className="rounded-md p-4">
                  <summary className="cursor-pointer text-lg font-semibold mb-2">
                    Balance Sheet – {selectedYear}
                  </summary>
                  <div className="mt-4">
                    {(() => {
                      const selectedRow = data.find(
                        d => d.ticker === selected && d.year === selectedYear && d.quarter === 0
                      );
                      if (!selectedRow) return <p className="text-gray-500">No data available.</p>;

                      const parsed: IncomeReport[] = JSON.parse(selectedRow.balance_sheet);
                      const matchedReport = parsed.find((r: IncomeReport) => {
                        const parts = r.date?.split('-');
                        return parts && parseInt(parts[2]) === selectedYear;
                      });

                      const reportMap = matchedReport?.map ?? {};


                      const strictGet = (map: Record<string, ReportItem>, labels: string | string[]): number | null => {
                        const normalize = (str: string) =>
                          str.toLowerCase()
                            .replace(/[’‘]/g, "'") // normalize curly quotes to straight
                            .replace(/\s+/g, ' ')  // normalize whitespace
                            .trim();

                        const targets = (Array.isArray(labels) ? labels : [labels]).map(normalize);

                        for (const key in map) {
                          const label = map[key]?.label;
                          if (!label) continue;
                          const normalized = normalize(label);
                          if (targets.includes(normalized)) return map[key].value;
                        }

                        return null;
                      };

                      const extractSharesOutstanding = (map: Record<string, ReportItem>): number | null => {
                        for (const key in map) {
                          const label = map[key]?.label;
                          if (!label) continue;
                          const cleanLabel = label.replace(/\u00a0/g, ' '); // Replace non-breaking spaces

                          const isExplicitlyInShares = /in shares/i.test(cleanLabel);

                          // 1. Match: "X and Y shares issued and outstanding"
                          const multiMatch = cleanLabel.match(/([\d,]+)\s+and\s+([\d,]+)\s+shares issued and outstanding/i);
                          if (multiMatch) {
                            const num1 = parseInt(multiMatch[1].replace(/,/g, ''), 10);
                            const num2 = parseInt(multiMatch[2].replace(/,/g, ''), 10);
                            const maxNum = Math.max(num1, num2);
                            return !isNaN(maxNum) ? (isExplicitlyInShares ? maxNum : maxNum * 1_000_000) : null;
                          }

                          // 2. Match: "X shares issued and outstanding as of ..."
                          const datedMatch = cleanLabel.match(/([\d,]+)\s+shares issued and outstanding\s+as of/i);
                          if (datedMatch) {
                            const num = parseInt(datedMatch[1].replace(/,/g, ''), 10);
                            return !isNaN(num) ? (isExplicitlyInShares ? num : num * 1_000_000) : null;
                          }

                          // 3. Match: "X shares issued and outstanding"
                          const fallback = cleanLabel.match(/([\d,]+)\s+shares issued and outstanding/i);
                          if (fallback && !cleanLabel.toLowerCase().includes("authorized")) {
                            const num = parseInt(fallback[1].replace(/,/g, ''), 10);
                            return !isNaN(num) ? (isExplicitlyInShares ? num : num * 1_000_000) : null;
                          }

                          // 4. Direct "Common stock, shares outstanding (in shares)"
                          if (/shares outstanding/i.test(cleanLabel) && isExplicitlyInShares) {
                            const num = map[key].value;
                            return !isNaN(num) ? (isExplicitlyInShares ? num : num * 1_000_000) : null;
                          }

                          // 5. Match: "outstanding: X shares at [date] and Y shares at [date]"
                          const outstandingMatch = cleanLabel.match(/outstanding:\s*([\d,]+)\s+shares/i);
                          if (outstandingMatch) {
                            const num = parseInt(outstandingMatch[1].replace(/,/g, ''), 10);
                            return !isNaN(num) ? (isExplicitlyInShares ? num : num * 1_000_000) : null;
                          }
                        }

                        return null;
                      };

                      const totalAssets = strictGet(reportMap, ["Total assets", "Assets"]);

                      const cash = getTagValue(reportMap, [
                        'us-gaap_CashAndCashEquivalentsAtCarryingValue',
                        'us-gaap_CashAndCashEquivalents',
                        'us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
                        'us-gaap_CashCashEquivalentsAndShortTermInvestments',
                        'us-gaap_Cash' // rare, but cheap fallback
                      ]) ?? 0;

                      const shortTermInv = getTagValue(reportMap, [
                        'us-gaap_ShortTermInvestments',
                        'us-gaap_MarketableSecuritiesCurrent'
                      ]) ?? 0;

                      const cashAndSTI = (typeof cash === 'number' ? cash : 0) + (typeof shortTermInv === 'number' ? shortTermInv : 0);

                      // Try to read an explicit equity line first
                      let totalEquity = getTagValue(reportMap, [
                        "us-gaap_StockholdersEquity",
                        "us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
                      ]);

                      // If there was no explicit equity line, derive it from assets & liabilities
                      // (we don’t know liabilities yet, so we’ll compute equity after we get liabilities)
                      const explicitLiabilities = getTagValue(reportMap, [
                        'us-gaap_Liabilities'
                      ]);

                      // Fallback: if we don’t have equity but *do* have assets & liabilities, derive equity
                      if (typeof totalEquity !== "number"
                        && typeof totalAssets === "number"
                        && typeof explicitLiabilities === "number"
                      ) {
                        totalEquity = totalAssets - explicitLiabilities;
                      }

                      // Now we can reliably compute liabilities: if we had an explicit liabilities
                      // line, use that; otherwise derive it from assets & equity
                      let totalLiabilities;
                      if (typeof explicitLiabilities === "number") {
                        totalLiabilities = explicitLiabilities;
                      } else if (typeof totalAssets === "number" && typeof totalEquity === "number") {
                        totalLiabilities = totalAssets - totalEquity;
                      } else {
                        totalLiabilities = null;
                      }

                      const preferredEquity = getTagValue(reportMap, [
                        'us-gaap_PreferredStockValue'
                      ]) ?? 0;

                      const sharesOutstanding = extractSharesOutstanding(reportMap);

                      const bookValuePerShare =
                        typeof totalEquity === "number"
                          && typeof sharesOutstanding === "number"
                          && sharesOutstanding > 0
                          ? (totalEquity - preferredEquity) / sharesOutstanding
                          : null;

                      const rows = [
                        { label: "Total assets", value: totalAssets },
                        { label: "Total liabilities", value: totalLiabilities },
                        { label: "Total equity", value: totalEquity },
                        { label: "Cash and short term investments", value: cashAndSTI },
                        { label: "Book value per share", value: bookValuePerShare }
                      ];


                      return (

                        // Put bar chart here
                        <div className="mt-8">
                          <div className="w-[95%] mx-auto">
                            <ResponsiveContainer width="100%" height={400}>
                              <BarChart
                                data={balanceChartData}
                                margin={{ top: 30, right: 30, left: 0, bottom: 0 }}
                                onClick={(e) => {
                                  if (e && e.activeLabel) {
                                    const year = parseInt(e.activeLabel.toString(), 10);
                                    if (!isNaN(year)) {
                                      setSelectedYear(year);
                                    }
                                  }
                                }}
                              >
                                <XAxis
                                  dataKey="year"
                                  tick={(props) => (
                                    <CustomXAxisTick
                                      {...props}
                                      onClick={(year: number) => {
                                        if (!isNaN(year)) {
                                          setSelectedYear(year);
                                        }
                                      }}
                                    />
                                  )}
                                />
                                <YAxis tick={false} axisLine={false} domain={[0, 'dataMax']} />
                                <Legend
                                  content={() => (
                                    <div className="flex justify-center gap-6 mt-4 text-sm">
                                      <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-[#8884d8]"></div>
                                        <span className="font-bold">Total Assets</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-[#82ca9d]"></div>
                                        <span className="font-bold">Total Liabilities</span>
                                      </div>
                                    </div>
                                  )}
                                />
                                <Bar dataKey="assets" fill="#8884d8" name="Total Assets" >
                                  <LabelList content={renderCustomBarLabel} />
                                </Bar>
                                <Bar dataKey="liabilities" fill="#82ca9d" name="Total Liabilities" >
                                  <LabelList content={renderCustomBarLabel} />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>

                            <table className="w-full mt-4 text-sm border-t">
                              <thead>
                                <tr className="text-left text-gray-400 border-b">
                                  <th className="py-2">(USD)</th>
                                  <th className="py-2">Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map(({ label, value }) => (
                                  <tr key={label} className="border-b">
                                    <td className="py-2">{label}</td>
                                    <td className="py-2 font-medium">
                                      {typeof value === 'number'
                                        ? label === "Book value per share"
                                          ? `$${value.toFixed(2)}`
                                          : formatDollars(value)
                                        : value ?? '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </details>
              </div>
            )}
            {selectedYear && (
              <div className="w-[95%] mx-auto">
                <details className="rounded-md p-4">
                  <summary className="cursor-pointer text-lg font-semibold mb-2">
                    Cash Flow – {selectedYear}
                  </summary>
                  <div className="mt-4">
                    {(() => {
                      const selectedRow = data.find(
                        d => d.ticker === selected && d.year === selectedYear && d.quarter === 0
                      );
                      if (!selectedRow || !selectedRow.cash_flow) {
                        return <p className="text-gray-500">No data available.</p>;
                      }

                      const parsed = JSON.parse(selectedRow.cash_flow);
                      const matchedReport = parsed.find((r: IncomeReport) => {
                        const parts = r.date?.split('-');
                        return parts && parseInt(parts[2]) === selectedYear;
                      });

                      const reportMap = matchedReport?.map ?? {};

                      const incomeParsed: IncomeReport[] = JSON.parse(selectedRow.income_statement);
                      const incomeMatch = incomeParsed.find((r: IncomeReport) => {
                        const parts = r.date?.split('-');
                        return parts && parseInt(parts[2]) === selectedYear;
                      });
                      const incomeMap: Record<string, ReportItem> = incomeMatch?.map ?? {};
                      const { netIncome } = extractMetrics(incomeMap);

                      const netOperating = getTagValue(
                        reportMap, [
                        'us-gaap_NetCashProvidedByUsedInOperatingActivities',
                        'us-gaap_NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
                        'ifrs-full_CashFlowsFromUsedInOperatingActivities'

                      ]);
                      const netInvesting = getTagValue(
                        reportMap, [
                        'us-gaap_NetCashProvidedByUsedInInvestingActivities',
                        'us-gaap_NetCashProvidedByUsedInInvestingActivitiesContinuingOperations',
                        'ifrs-full_CashFlowsFromUsedInInvestingActivities'

                      ]);
                      const netFinancing = getTagValue(
                        reportMap, [
                        'us-gaap_NetCashProvidedByUsedInFinancingActivities',
                        'us-gaap_NetCashProvidedByUsedInFinancingActivitiesContinuingOperations',
                        'ifrs-full_CashFlowsFromUsedInFinancingActivities'

                      ]);
                      const netCashChange = getTagValue(
                        reportMap, [
                        'us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect',
                        'us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseExcludingExchangeRateEffect',
                        'us-gaap_CashAndCashEquivalentsPeriodIncreaseDecrease',
                        'hsic_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffectContinuingOperations',
                        'ifrs-full_IncreaseDecreaseInCashAndCashEquivalentsBeforeEffectOfExchangeRateChanges',
                        'ifrs-full_IncreaseDecreaseInCashAndCashEquivalents'

                      ]);

                      // helper: sum any numeric tags found; returns null if none found
                      const sumTags = (map: Record<string, ReportItem>, tags: string[]): number | null => {
                        let found = false;
                        let sum = 0;
                        for (const t of tags) {
                          const v = getTagValue(map, [t]);
                          if (typeof v === 'number') {
                            sum += v;
                            found = true;
                          }
                        }
                        return found ? sum : null;
                      };

                      // CapEx outflow tags (additive)
                      const capexOutflowTags = [
                        // classic PP&E
                        'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment',
                        'us-gaap_PaymentsToAcquireProductiveAssets',
                        'us-gaap_PaymentsToAcquireOtherProductiveAssets',
                        'ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
                        'ifrs-full_AcquisitionOfPropertyPlantAndEquipment',

                        // REIT / real-estate style
                        'us-gaap_PaymentsForCapitalImprovements',
                        'us-gaap_PaymentsToAcquireCommercialRealEstate',
                        'us-gaap_PaymentsToAcquireRealEstate',
                      ];

                      // CapEx proceeds tags (to subtract)
                      const capexProceedsTags = [
                        'us-gaap_ProceedsFromSaleOfPropertyPlantAndEquipment',
                        'us-gaap_ProceedsFromSaleOfProductiveAssets',
                        'us-gaap_ProceedsFromSaleOfPropertyHeldForSale', // common in REITs
                        'ifrs-full_ProceedsFromSalesOfPropertyPlantAndEquipment',
                      ];

                      // signed sums (cash flow sign convention: outflows typically negative)
                      const capexOutflowsSigned = sumTags(reportMap, capexOutflowTags) ?? 0;   // likely negative
                      const capexProceedsSigned = sumTags(reportMap, capexProceedsTags) ?? 0;   // likely positive

                      // net CapEx (signed): outflows + proceeds; magnitude used for FCF subtraction
                      const netCapexSigned = capexOutflowsSigned + capexProceedsSigned;
                      const capexOutflow = (capexOutflowsSigned !== 0 || capexProceedsSigned !== 0)
                        ? Math.abs(netCapexSigned)
                        : null;

                      // Free Cash Flow = CFO - CapEx (magnitude)
                      const freeCashFlow = (typeof netOperating === 'number' && typeof capexOutflow === 'number')
                        ? netOperating - capexOutflow
                        : null;


                      const rows = [
                        { label: "Net Income", value: netIncome },
                        { label: "Operating Cash Flow", value: netOperating },
                        { label: "Investing Cash Flow", value: netInvesting },
                        { label: "Financing Cash Flow", value: netFinancing },
                        { label: "Net Change in Cash", value: netCashChange },
                        { label: "Free Cash Flow", value: freeCashFlow }
                      ];

                      return (

                        <div className="mt-8">
                          <div className="w-[95%] mx-auto">
                            <ResponsiveContainer width="100%" height={400}>
                              <BarChart
                                data={cashFlowChartData}
                                margin={{ top: 30, right: 30, left: 0, bottom: 0 }}
                                onClick={(e) => {
                                  if (e && e.activeLabel) {
                                    const year = parseInt(e.activeLabel.toString(), 10);
                                    if (!isNaN(year)) {
                                      setSelectedYear(year);
                                    }
                                  }
                                }}
                              >
                                <XAxis
                                  dataKey="year"
                                  axisLine={false}
                                  tick={(props) => (
                                    <CustomXAxisTick
                                      {...props}
                                      onClick={(year: number) => {
                                        if (!isNaN(year)) {
                                          setSelectedYear(year);
                                        }
                                      }}
                                    />
                                  )}
                                />
                                <YAxis tick={false} axisLine={false} domain={[(dataMin: number) => Math.min(0, dataMin) * 1.1, (dataMax: number) => dataMax * 1.1]} />
                                <ReferenceLine y={0} stroke="#9CA3AF" />
                                <Legend
                                  content={() => (
                                    <div className="flex justify-center gap-6 mt-4 text-sm">
                                      <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-[#8884d8]"></div>
                                        <span className="font-bold">Net Change In Cash</span>
                                      </div>
                                    </div>
                                  )}
                                />
                                <Bar dataKey="netChange" fill="#8884d8" name="Net Change in Cash">
                                  <LabelList content={renderCustomBarLabel} />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>

                            <table className="w-full mt-4 text-sm border-t">
                              <thead>
                                <tr className="text-left text-gray-400 border-b">
                                  <th className="py-2">(USD)</th>
                                  <th className="py-2">Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map(({ label, value }) => (
                                  <tr key={label} className="border-b">
                                    <td className="py-2">{label}</td>
                                    <td className="py-2 font-medium">
                                      {typeof value === 'number' ? formatDollars(value) : value ?? '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
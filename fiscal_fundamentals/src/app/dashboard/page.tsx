// src/app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, XAxisProps, YAxis, Legend, ResponsiveContainer, LabelList, LabelProps } from 'recharts';
import { useSearchParams } from 'next/navigation';
import { getTagValue } from '@/app/lib/xbrl';


interface FinancialRow {
  ticker: string;
  company_name?: string;
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

const extractMetrics = (rawMap: Record<string, { label?: string; value?: number }>) => {
  let revenue = 0;
  let netIncome = 0;

  const revenueKeys = [
    'axp_TotalRevenuesNetOfInterestExpenseAfterProvisionsForLosses',
    'us-gaap_Revenues',
    'us-gaap_RevenuesNetOfInterestExpense',
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
        console.log('Fetched data:', json);

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




  interface IncomeReport {
    date: string;
    months: number;
    map: Record<string, ReportItem>;
  }

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


      const totalAssets = strictGet(reportMap, ["Total assets", "Assets"]);
      let totalEquity = strictGet(reportMap, ["Total stockholders’ equity", "Total shareholders’ equity", "Total shareholders' equity", "total shareholders' equity", "total equity", "total shareholders' equity (deficit)", "Total stockholders’ (deficit) equity", "Total stockholders’ equity (deficit)"]);
      const explicitLiabilities = strictGet(reportMap, [
        'Total liabilities',
        'Total Liabilities',
        'Liabilities'
      ]);
      // derive equity if missing and we have assets + explicit liabilities
      if (
        typeof totalEquity !== 'number' &&
        typeof totalAssets === 'number' &&
        typeof explicitLiabilities === 'number'
      ) {
        totalEquity = totalAssets - explicitLiabilities;
      }

      let totalLiabilities: number | null = null;
      if (typeof explicitLiabilities === 'number') {
        totalLiabilities = explicitLiabilities;
      } else if (
        typeof totalAssets === 'number' &&
        typeof totalEquity === 'number'
      ) {
        totalLiabilities = totalAssets - totalEquity;
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


  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Financial Dashboard</h1>

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
                    Income Statement for {selected} – {selectedYear}
                  </summary>
                  <div className="mt-4">
                    {(() => {
                      const selectedRow = data.find(
                        d => d.ticker === selected && d.year === selectedYear && d.quarter === 0
                      );
                      if (!selectedRow) return <p className="text-gray-500">No data available.</p>;

                      const parsed: IncomeReport[] = JSON.parse(selectedRow.income_statement);
                      const reportMap = parsed[0]?.map ?? {};

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


                      const { revenue, netIncome } = extractMetrics(reportMap);
                      const netProfitMargin = revenue ? (netIncome / revenue) * 100 : null;

                      // GAAP first, then IFRS fallback if you want
                      const incomeTaxVal = getTagValue(reportMap, [
                        'us-gaap_IncomeTaxExpenseBenefit',
                        'ifrs-full_IncomeTaxExpenseContinuingOperations',
                      ]);

                      const preTaxIncomeVal = getTagValue(reportMap, [
                        'us-gaap_IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
                        'us-gaap_IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
                        'us-gaap_IncomeLossIncludingPortionAttributableToNoncontrollingInterest',
                        'mcd_IncomeLossFromContinuingOperationsBeforeIncomeTaxes',
                        'ifrs-full_ProfitLossBeforeTax',
                      ]);

                      const effectiveTaxRate =
                        typeof incomeTaxVal === 'number' &&
                          typeof preTaxIncomeVal === 'number' &&
                          preTaxIncomeVal !== 0
                          ? (incomeTaxVal / preTaxIncomeVal) * 100 // remove Math.abs if you want negative when it's a benefit
                          : null;

                      console.log({ incomeTaxVal, preTaxIncomeVal, effectiveTaxRate });


                      let operatingExpense = strictGet(reportMap, [
                        "operating expense",
                        "operating expenses",
                        "total operating expenses",
                        "costs and expenses",
                        "operating costs",
                        "operating income and expense",
                        "operating expense (excluding depreciation)",
                        "operating, selling, general and administrative expenses",
                        "total expenses",
                        "total noninterest expense",
                        "total expenses excluding interest",
                        "total operating costs and expenses",
                        "selling, general and administrative expenses, including $27, $19, and $14, respectively, to related parties",
                      ]);

                      if (operatingExpense === null) {

                        const expenseLabels = [
                          "selling, general and administrative",
                          "sg&a",
                          "administrative expenses",
                          "general and administrative",
                          "research and development expenses",
                          "selling, administrative and general expenses",
                          "sales and marketing",
                          "marketing",
                          "technology and development",
                          "marketing, general and administrative",
                          "research and development",
                          "licensing gain",
                          "amortization of acquisition-related intangibles",
                          "amortization of acquisition-related intangibles_opex",
                          "other operating expense, net",
                          "other operating expenses",
                          "other (income) expense, net",
                          "other expense (income), net",
                          "selling, general and administrative expenses, including $31, $33, and $33, respectively, to related parties", // Carvana Specific
                          "selling, general and administrative expenses, including $33, $33, and $27, respectively, to related parties",
                          "selling, general and administrative expenses, including $33, $27, and $19, respectively, to related parties",
                          "selling, administrative, and other expenses",
                          "automotive and other selling, general and administrative expense"
                        ];

                        let sgna = 0;

                        for (const label of expenseLabels) {
                          const val = strictGet(reportMap, [label]);
                          if (typeof val === "number") sgna += val;
                        }

                        operatingExpense = sgna > 0 ? sgna : null;

                      }


                      const rows = [
                        { label: "Revenue", value: revenue },
                        { label: "Operating expense", value: Math.abs(operatingExpense ?? 0) },
                        { label: "Net income", value: netIncome },
                        { label: "Net profit margin", value: netProfitMargin },
                        {
                          label: "Earnings per share", value: getTagValue(reportMap, [
                            'us-gaap_EarningsPerShareBasic',
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
                              <th className="py-2">Metric</th>
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
                    Balance Sheet for {selected} – {selectedYear}
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

                      // Try to read an explicit equity line first
                      let totalEquity = strictGet(reportMap, [
                        "Total stockholders’ equity",
                        "Total shareholders’ equity",
                        "Total shareholders' equity",
                        "total shareholders' equity",
                        "total equity",
                        "total shareholders' equity (deficit)",
                        "Total stockholders’ (deficit) equity",
                        "Total stockholders’ equity (deficit)"
                      ]);

                      // If there was no explicit equity line, derive it from assets & liabilities
                      // (we don’t know liabilities yet, so we’ll compute equity after we get liabilities)
                      const explicitLiabilities = strictGet(reportMap, [
                        "Total liabilities",
                        "Total Liabilities",
                        "Liabilities"
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
                                  <th className="py-2">Metric</th>
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
                    Cash Flow for {selected} – {selectedYear}
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

                      const netOperating = getTagValue(
                        reportMap, [
                        'us-gaap_NetCashProvidedByUsedInOperatingActivities',
                        'ifrs-full_CashFlowsFromUsedInOperatingActivities'

                      ]);
                      const netInvesting = getTagValue(
                        reportMap, [
                        'us-gaap_NetCashProvidedByUsedInInvestingActivities',
                        'ifrs-full_CashFlowsFromUsedInInvestingActivities'

                      ]);
                      const netFinancing = getTagValue(
                        reportMap, [
                        'us-gaap_NetCashProvidedByUsedInFinancingActivities',
                        'ifrs-full_CashFlowsFromUsedInFinancingActivities'

                      ]);
                      const netCashChange = getTagValue(
                        reportMap, [
                        'us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect',
                        'ifrs-full_IncreaseDecreaseInCashAndCashEquivalentsBeforeEffectOfExchangeRateChanges',
                        'ifrs-full_IncreaseDecreaseInCashAndCashEquivalents'

                      ]);

                      const rows = [
                        { label: "Operating Cash Flow", value: netOperating },
                        { label: "Investing Cash Flow", value: netInvesting },
                        { label: "Financing Cash Flow", value: netFinancing },
                        { label: "Net Change in Cash", value: netCashChange },
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
                                <YAxis tick={false} axisLine={false} domain={['dataMin', 'dataMax']} />
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
                                  <th className="py-2">Metric</th>
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
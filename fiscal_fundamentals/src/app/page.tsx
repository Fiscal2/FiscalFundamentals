// src/app/dashboard/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, XAxisProps, YAxis, Legend, ResponsiveContainer, LabelList, LabelProps } from 'recharts';
import StockSearch from './components/layout/navbar/search/stock-search';

interface FinancialRow {
  ticker: string;
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

const extractMetrics = (reportMap: Record<string, { label?: string; value?: number }>) => {
  let revenue = 0;
  let netIncome = 0;

    const revenueKeys = [
    'us-gaap_Revenues',
    'us-gaap_RevenuesNetOfInterestExpense',
    'us-gaap_SalesRevenueNet',
    'us-gaap_SalesRevenueServicesNet'
  ];
  const incomeKeys = [
    'us-gaap_ProfitLoss',
    'us-gaap_NetIncomeLoss',
    'us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic'
  ];

  const findByKeys = (keys: string[]) =>
    keys.map(k =>
      Object.keys(reportMap).find(key => key.includes(k))
    ).find(k => k && reportMap[k]);

  const revKey = findByKeys(revenueKeys);
  const niKey = findByKeys(incomeKeys);

  if (revKey) revenue = reportMap[revKey].value ?? 0;
  if (niKey) netIncome = reportMap[niKey].value ?? 0;

  // Fallback to fuzzy label search
  if (!revenue) {
    for (const key in reportMap) {
      const label = reportMap[key]?.label?.toLowerCase() || '';
      if (
        label.includes('total net revenue') ||
        label.includes('net sales') ||
        label.includes('revenue') ||
        label.includes('total revenues')
      ) {
        revenue = reportMap[key].value ?? revenue;
        break;
      }
    }
  }

  if (!netIncome) {
    for (const key in reportMap) {
      const label = reportMap[key]?.label?.toLowerCase() || '';
      if (
        label.includes('net income applicable') ||
        label.includes('net income') ||
        label.includes('net earnings') ||
        label.includes('net profit')
      ) {
        netIncome = reportMap[key].value ?? netIncome;
        break;
      }
    }
  }

  return { revenue, netIncome };
};

export default function Dashboard() {
  const [data, setData] = useState<FinancialRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const hasSelectedOnce = useRef(false);

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
  if (!selected || hasSelectedOnce.current) return;

  const companyData = data.filter(d => d.ticker === selected && d.quarter === 0);
  if (companyData.length === 0) return;

  const mostRecentYear = Math.max(...companyData.map(d => d.year));
  setSelectedYear(mostRecentYear);

  hasSelectedOnce.current = true; // mark that we've handled the first selection
}, [selected, data]);


  const uniqueTickers = [...new Set(data.map(d => d.ticker))];

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


    const totalAssets = strictGet(reportMap, "Total assets");
    const totalEquity = strictGet(reportMap, ["Total stockholders’ equity", "Total shareholders’ equity", "Total shareholders' equity", "total shareholders' equity", "total equity", "total shareholders' equity (deficit)", "Total stockholders’ (deficit) equity", "Total stockholders’ equity (deficit)"]);
    const totalLiabilities = 
      typeof totalAssets === 'number' && typeof totalEquity === 'number'
        ? totalAssets - totalEquity
        : null;

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

    const netCashChange = strictGet(
      reportMap,[
      "Net increase (decrease) in cash, cash equivalents and restricted cash",
      "Net (decrease) increase in cash and cash equivalents and restricted cash",
      "Net increase (decrease) in cash and cash equivalents",
      "Net increase (decrease) in total cash and cash equivalents",
      "Net (decrease) increase in total cash and cash equivalents",
      "Net (decrease) increase in cash and cash equivalents",
      "Net increase (decrease) in cash, cash equivalents, and restricted cash",
      "Cash, cash equivalents and restricted cash, net increase (decrease)",
      "Net increase (decrease) in cash and cash equivalents and restricted cash",
      "Increase/(Decrease) in cash, cash equivalents, and restricted cash and cash equivalents",
      "Increase/(Decrease) in cash, cash equivalents and restricted cash",
      "Decrease in cash, cash equivalents and restricted cash",
      "Net increase/(decrease) in cash and due from banks and deposits with banks",
      "Net cash (used in)/provided by investing activities",
      "Increase in cash and cash equivalents",
      "Change in cash and cash equivalents",
      "Net change in cash and cash equivalents",
      "Net increase in cash and cash equivalents, and restricted cash",
      "Net increase in cash and cash equivalents",
      "Cash and equivalents increase (decrease)",
      "Cash, Cash Equivalents, Restricted Cash and Restricted Cash Equivalents, Period Increase (Decrease), Including Exchange Rate Effect, Total",
      "Change in cash and due from banks",
      "Increase (decrease) in cash, cash equivalents, restricted cash and restricted cash equivalents"
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

      <div className="grid grid-cols-4 gap-4">
        <StockSearch allTickers={uniqueTickers} onSelect={setSelected} />
      </div>

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
              <YAxis tick={false} axisLine={false} domain={[0, 'dataMax']}/>
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
                <LabelList content={renderCustomBarLabel}/>
              </Bar>
              <Bar dataKey="netIncome" fill="#82ca9d" name="Net Income" >
                <LabelList content={renderCustomBarLabel}/>
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

                  const incomeTax = strictGet(reportMap, [
                    "income tax expense",
                    "provision for income taxes",
                    "income tax expense (benefit)",
                    "income tax provision",
                    "(Benefit from) provision for income taxes",
                    "benefit (provision) for income taxes",
                    "income tax provision (benefit)",
                    "applicable income taxes"
                  ]);

                  const preTaxIncome = strictGet(reportMap, [
                    "income before income taxes",
                    "income before income tax",
                    "income/(loss) before income tax expense/(benefit)",
                    "earnings before taxes",
                    "earnings before provision for income taxes",
                    "pretax income",
                    "income before provision for income taxes",
                    "total",
                    "income from continuing operations before income taxes",
                    "(benefit from) provision for income taxes",
                    "Income before income taxes and equity income",
                    "Income (loss) before income taxes"
                  ]);
                  console.log("Income tax:", incomeTax)
                  console.log("Pre Tax Income:", preTaxIncome)
                  const effectiveTaxRate =
                    typeof incomeTax === 'number' &&
                    typeof preTaxIncome === 'number' &&
                    preTaxIncome !== 0
                      ? Math.abs((incomeTax / preTaxIncome) * 100)
                      : null;

                  let operatingExpense = strictGet(reportMap, [
                    "operating expense",
                    "operating expenses",
                    "total operating expenses",
                    "costs and expenses",
                    "operating costs",
                    "operating income and expense",
                    "operating expense (excluding depreciation)",
                    "total costs and expenses",
                    "total expenses",
                    "total noninterest expense",
                    "total expenses excluding interest",
                    "total operating costs and expenses"
                  ]);

                  if (operatingExpense === null) {

                    const expenseLabels = [
                      "selling, general and administrative",
                      "sg&a",
                      "administrative expenses",
                      "general and administrative",
                      "sales and marketing",
                      "marketing",
                      "technology and development"
                    ];

                    let sgna = 0;

                    for (const label of expenseLabels) {
                      const val = strictGet(reportMap, [label]);
                      if (typeof val === "number") sgna += val;
                    }

                    operatingExpense = sgna > 0 ? sgna : null;

                  }

                  const rows = [
                    { label: "Revenue", value: revenue},
                    { label: "Operating expense", value: operatingExpense},
                    { label: "Net income", value: netIncome },
                    { label: "Net profit margin", value: netProfitMargin },
                    { label: "Earnings per share", value: strictGet(reportMap, [
                      "Basic (in dollars per share)",
                      "Basic",
                      "Basic (in USD per share)",
                      "Earnings Per Share, Basic, Total",
                      "Basic earnings per share",
                      "Basic net income per share",
                      "Earnings per common share (in dollars per share)",
                      "Earnings per common share",
                      "Basic earnings per share (in dollars per share)",
                      "Basic net income per share (in dollars per share)",
                      "Basic net income per share of Class A, Class B, and Class C stock (in dollars per share)",
                      "Basic net income per share of Class A and B common stock and Class C capital stock (in dollars per share)"
                    ]) },
                    { label: "Effective tax rate", value: effectiveTaxRate },
                  ];

                  return (
                    <table className="w-full mt-4 text-sm border-t">
                      <thead>
                        <tr className="text-left text-gray-600 border-b">
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



                        const totalAssets = strictGet(reportMap, "Total assets");
                        const totalEquity = strictGet(reportMap, ["Total stockholders’ equity", "Total shareholders’ equity", "Total shareholders' equity", "total shareholders' equity", "total equity", "total shareholders' equity (deficit)", "Total stockholders’ (deficit) equity", "Total stockholders’ equity (deficit)"]);
                        const totalLiabilities = 
                          typeof totalAssets === 'number' && typeof totalEquity === 'number'
                            ? totalAssets - totalEquity
                            : null;
                        const preferredEquity = strictGet(reportMap, ["Preferred equity", "Preferred stock", "Preferred stock, $0.001 par value; 2 shares authorized; none issued"]) ?? 0;
                        const sharesOutstanding = extractSharesOutstanding(reportMap);
    
                        // console.log("Equity:", totalEquity);
                        // console.log("Preferred Equity:", preferredEquity);
                        // console.log("Shares Outstanding:", sharesOutstanding);


                        const bookValuePerShare =
                          typeof totalEquity === 'number' &&
                          typeof sharesOutstanding === 'number' &&
                          sharesOutstanding > 0
                            ? (totalEquity - preferredEquity) / sharesOutstanding
                            : null;

                        // console.log("Book Value Per Share:", bookValuePerShare);

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
                              <YAxis tick={false} axisLine={false} domain={[0, 'dataMax']}/>
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
                                <LabelList content={renderCustomBarLabel}/>
                              </Bar>
                              <Bar dataKey="liabilities" fill="#82ca9d" name="Total Liabilities" >
                                <LabelList content={renderCustomBarLabel}/>
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>

                          <table className="w-full mt-4 text-sm border-t">
                            <thead>
                              <tr className="text-left text-gray-600 border-b">
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

                        const netOperating = strictGet(
                          reportMap, [
                            "Net cash provided by operating activities", 
                            "Net cash provided by (used in) operating activities",
                            "Cash generated by operating activities",
                            "Net cash provided by/(used in) operating activities",
                            "Net cash (used in)/provided by operating activities",
                            "Cash flows from operating activities",
                            "Cash provided by operations"
                          ]);
                        const netInvesting = strictGet(
                          reportMap, [
                            "Net cash provided by (used in) investing activities", 
                            "Net cash (used in) provided by investing activities", 
                            "Net cash used in investing activities",
                            "Net cash provided (used) by investing activities",
                            "Net cash used by investing activities",
                            "Net cash (used) provided by investing activities",
                            "Cash generated by/(used in) investing activities",
                            "Cash used in investing activities",
                            "Net cash (used in) investing activities",
                            "Net cash provided by/(used in) investing activities",
                            "Net cash (used in)/provided by investing activities",
                            "Cash flows used for investing activities",
                            "Cash used for investing activities"

                          ]);
                        const netFinancing = strictGet(
                          reportMap, [
                            "Net cash provided by (used in) financing activities",
                            "Net cash (used in) provided by financing activities",
                            "Net cash provided by financing activities",
                            "Net cash used in financing activities",
                            "Net cash used by financing activities",
                            "Cash used in financing activities",
                            "Net cash provided by/(used in) financing activities",
                            "Cash flows (used for) from financing activities",
                            "Cash flows from (used for) financing activities",
                            "Cash flows used for financing activities",
                            "Cash used for financing activities"

                            
                          ]);
                        const netCashChange = strictGet(
                          reportMap,[
                            "Net increase (decrease) in cash, cash equivalents and restricted cash",
                            "Net (decrease) increase in cash and cash equivalents and restricted cash",
                            "Net increase (decrease) in cash and cash equivalents",
                            "Net increase (decrease) in total cash and cash equivalents",
                            "Cash, cash equivalents and restricted cash, net increase (decrease)",
                            "Net increase (decrease) in cash, cash equivalents, and restricted cash",
                            "Net (decrease) increase in total cash and cash equivalents",
                            "Net (decrease) increase in cash and cash equivalents",
                            "Net increase (decrease) in cash and cash equivalents and restricted cash",
                            "Increase/(Decrease) in cash, cash equivalents, and restricted cash and cash equivalents",
                            "Increase/(Decrease) in cash, cash equivalents and restricted cash",
                            "Decrease in cash, cash equivalents and restricted cash",
                            "Net increase/(decrease) in cash and due from banks and deposits with banks",
                            "Increase in cash and cash equivalents",
                            "Change in cash and cash equivalents",
                            "Net change in cash and cash equivalents",
                            "Net increase in cash and cash equivalents, and restricted cash",
                            "Net increase in cash and cash equivalents",
                            "Cash and equivalents increase (decrease)",
                            "Cash, Cash Equivalents, Restricted Cash and Restricted Cash Equivalents, Period Increase (Decrease), Including Exchange Rate Effect, Total",
                            "Change in cash and due from banks",
                            "Increase (decrease) in cash, cash equivalents, restricted cash and restricted cash equivalents"

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
                              <YAxis tick={false} axisLine={false} domain={['dataMin', 'dataMax']}/>
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
                              <tr className="text-left text-gray-600 border-b">
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

// src/app/dashboard/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, XAxisProps, YAxis, Legend, ResponsiveContainer, LabelList, LabelProps } from 'recharts';

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

  const findKey = (partialKey: string) =>
    Object.keys(reportMap).find(k => k.includes(partialKey));

  const revKey = findKey('us-gaap_RevenuesNetOfInterestExpense');
  const niKey = findKey('us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic');

  if (revKey) revenue = reportMap[revKey].value ?? 0;
  if (niKey) netIncome = reportMap[niKey].value ?? 0;

  // Fallback to fuzzy label search
  if (!revenue) {
    for (const key in reportMap) {
      const label = reportMap[key]?.label?.toLowerCase() || '';
      if (
        label.includes('total net revenue') ||
        label.includes('net sales') ||
        label.includes('revenue')
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

    const strictGet = (map: Record<string, ReportItem>, exactLabel: string) => {
      for (const key in map) {
        const label = map[key]?.label;
        if (label === exactLabel) {
          return map[key].value;
        }
      }
      return null;
    };

    const totalAssets = strictGet(reportMap, "Total assets");
    const totalLiabilities = strictGet(reportMap, "Total liabilities");
    const totalEquity = strictGet(reportMap, "Total stockholders’ equity");

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

    const strictGet = (map: Record<string, ReportItem>, labels: string | string[]) => {
      const targets = Array.isArray(labels) ? labels : [labels];
      for (const key in map) {
        const label = map[key]?.label;
        if (label && targets.includes(label)) {
          return map[key].value;
        }
      }
      return null;
    };

    const netCashChange = strictGet(
      reportMap,[
      "Net increase (decrease) in cash, cash equivalents and restricted cash",
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
      "Change in cash and cash equivalents"
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
        {uniqueTickers.map(ticker => (
          <button
            key={ticker}
            onClick={() => setSelected(ticker)}
            className={`rounded px-4 py-2 border ${
              selected === ticker ? 'text-white' : 'bg-white text-black border-gray-300'
            }`}
          >
            {ticker}
          </button>
        ))}
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

                  const fuzzyGet = (map: Record<string, ReportItem>, aliases: string[]) => {
                    const normalize = (str: string) =>
                      str.toLowerCase().replace(/[^a-z0-9]/g, ''); // remove all non-alphanumeric characters

                    const normalizedAliases = aliases.map(alias => normalize(alias));

                    for (const key in map) {
                      const label = map[key]?.label || '';
                      const normalizedLabel = normalize(label);

                      if (normalizedAliases.includes(normalizedLabel)) {
                        return map[key].value;
                      }
                    }

                    return null;
                  };


                  const { revenue, netIncome } = extractMetrics(reportMap);
                  const netProfitMargin = revenue ? (netIncome / revenue) * 100 : null;

                  const incomeTax = fuzzyGet(reportMap, [
                    "income tax expense",
                    "provision for income taxes",
                    "income tax expense (benefit)",
                    "income tax provision"
                  ]);

                  const preTaxIncome = fuzzyGet(reportMap, [
                    "income before income taxes",
                    "income/(loss) before income tax expense/(benefit)",
                    "earnings before taxes",
                    "pretax income",
                    "income before provision for income taxes",
                    "total",
                    "income from continuing operations before income taxes",
                    "(benefit from) provision for income taxes",
                  ]);
                  const effectiveTaxRate =
                    typeof incomeTax === 'number' &&
                    typeof preTaxIncome === 'number' &&
                    preTaxIncome !== 0
                      ? (incomeTax / preTaxIncome) * 100
                      : null;

                  // console.log("Selected:", selected);
                  // console.log("Year:", selectedYear);
                  // console.log("Income Tax:", incomeTax);
                  // console.log("Pre-Tax Income:", preTaxIncome);
                  // console.log("Effective Tax Rate:", effectiveTaxRate);

                  const rows = [
                    { label: "Revenue", value: revenue},
                    { label: "Operating expense", value: fuzzyGet(reportMap, [
                      "operating expense",
                      "operating expenses",
                      "total operating expenses",
                      "costs and expenses",
                      "operating costs",
                      "operating income and expense",
                      "operating expense (excluding depreciation)",
                      "total costs and expenses",
                      "cost of revenue and operating expenses",
                      "cost of revenues",
                      "total expenses",
                      "total noninterest expense",
                      "Total expenses excluding interest",

                    ]) },
                    { label: "Net income", value: netIncome },
                    { label: "Net profit margin", value: netProfitMargin },
                    { label: "Earnings per share", value: fuzzyGet(reportMap, [
                      "Basic (in dollars per share)",
                      "Basic (in USD per share)",
                      "Earnings Per Share, Basic, Total",
                      "Basic earnings per share",
                      "Basic net income per share",
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


                        const strictGet = (map: Record<string, ReportItem>, exactLabels: string | string[]) => {
                          const labels = Array.isArray(exactLabels) ? exactLabels : [exactLabels];
                          for (const key in map) {
                            const label = map[key]?.label;
                            if (labels.includes(label)) {
                              return map[key].value;
                            }
                          }
                          return null;
                        };

                        const extractSharesOutstanding = (map: Record<string, ReportItem>): number | null => {
                          for (const key in map) {
                            const label = map[key]?.label;
                            if (!label) continue;

                            // Match patterns like: 12,211 (Class A...) shares issued and outstanding
                            const match = label.match(/([0-9,]+)\s*\((Class.*?)\)\s*shares issued and outstanding/i);
                            if (match) {
                              const num = parseInt(match[1].replace(/,/g, ''), 10);
                              return !isNaN(num) ? num * 1_000_000 : null;
                            }

                            // Fallback pattern: 12,211 shares issued and outstanding
                            const fallback = label.match(/([0-9,]+)\s+shares (?:issued and )?outstanding/i);
                            if (fallback) {
                              const num = parseInt(fallback[1].replace(/,/g, ''), 10);
                              return !isNaN(num) ? num * 1_000_000 : null;
                            }
                          }

                          return null;
                        };

                        const totalAssets = strictGet(reportMap, "Total assets");
                        const totalLiabilities = strictGet(reportMap, "Total liabilities");
                        const totalEquity = strictGet(reportMap, ["Total stockholders’ equity", "Total shareholders’ equity", "Total shareholders' equity"]);
                        const preferredEquity = strictGet(reportMap, ["Preferred equity", "Preferred stock"]) ?? 0;
                        const sharesOutstanding = extractSharesOutstanding(reportMap);

                        const bookValuePerShare =
                          typeof totalEquity === 'number' &&
                          typeof sharesOutstanding === 'number' &&
                          sharesOutstanding > 0
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

                        const strictGet = (map: Record<string, ReportItem>, labels: string | string[]) => {
                          const all = Array.isArray(labels) ? labels : [labels];
                          for (const key in map) {
                            const label = map[key]?.label;
                            if (all.includes(label)) return map[key].value;
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
                            "Cash flows from operating activities"
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
                            "Cash flows used for investing activities"

                          ]);
                        const netFinancing = strictGet(
                          reportMap, [
                            "Net cash provided by (used in) financing activities", 
                            "Net cash provided by financing activities",
                            "Net cash used in financing activities",
                            "Net cash used by financing activities",
                            "Cash used in financing activities",
                            "Net cash provided by/(used in) financing activities",
                            "Cash flows (used for) from financing activities",
                            "Cash flows from (used for) financing activities",
                            "Cash flows used for financing activities"

                            
                          ]);
                        const netCashChange = strictGet(
                          reportMap,[
                            "Net increase (decrease) in cash, cash equivalents and restricted cash",
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
                            "Change in cash and cash equivalents"

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

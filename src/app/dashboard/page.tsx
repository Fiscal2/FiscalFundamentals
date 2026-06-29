// src/app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, XAxisProps, YAxis, Legend, ResponsiveContainer, LabelList, LabelProps, ReferenceLine } from 'recharts';
import { useSearchParams } from 'next/navigation';
import { getAnnualOverview, getCompanyName } from '@/lib/warehouse';
import { AnnualOverview } from '@/lib/types';
import { tickerToCik, cikToTicker } from '@/lib/tickers';
import { formatCompanyName } from '@/lib/company-name';
import StatementsView from './statements-view';

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

type CellKind = 'dollars' | 'percent' | 'pershare';

const renderCell = (value: number | null, kind: CellKind = 'dollars'): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (kind === 'percent') return `${value.toFixed(2)}%`;
  if (kind === 'pershare') return `$${value.toFixed(2)}`;
  return formatDollars(value);
};

// Resolve a ?ticker= value to a CIK: try the SEC ticker map first, then fall
// back to treating the value itself as a raw CIK.
const resolveCik = (raw: string | null): number | null => {
  if (!raw) return null;
  const fromTicker = tickerToCik(raw);
  if (fromTicker != null) return fromTicker;
  const asNum = parseInt(raw, 10);
  return isNaN(asNum) ? null : asNum;
};

export default function Dashboard() {
  const searchParams = useSearchParams();
  const tickerParam = searchParams.get('ticker');
  const cik = resolveCik(tickerParam);

  const [overview, setOverview] = useState<AnnualOverview[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'overview' | 'statements'>('overview');
  const [warehouseName, setWarehouseName] = useState<string | null>(null);

  useEffect(() => {
    if (cik == null) {
      setOverview([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const rows = await getAnnualOverview(cik);
        if (!cancelled) setOverview(rows);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch overview:', err);
          setOverview([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cik]);

  useEffect(() => {
    if (overview.length === 0) {
      setSelectedYear(null);
      return;
    }
    setSelectedYear(Math.max(...overview.map((o) => o.year)));
  }, [overview]);

  useEffect(() => {
    if (cik == null) {
      setWarehouseName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const name = await getCompanyName(cik);
        if (!cancelled) setWarehouseName(name);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch company name:', err);
          setWarehouseName(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [cik]);

  const incomeChartData = overview.map((o) => ({
    year: o.year,
    revenue: o.revenue ?? 0,
    netIncome: o.netIncome ?? 0,
  }));
  const balanceChartData = overview.map((o) => ({
    year: o.year,
    assets: o.totalAssets ?? 0,
    liabilities: o.totalLiabilities ?? 0,
  }));
  const cashFlowChartData = overview.map((o) => ({
    year: o.year,
    netChange: o.netChangeInCash ?? 0,
  }));

  const selected = overview.find((o) => o.year === selectedYear) ?? null;

  const renderCustomBarLabel = (props: LabelProps) => {
    const { x, y, width, value } = props;
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
    payload: { value: number };
    onClick: (year: number) => void;
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
          <rect x={-width / 2} y={0} width={width} height={height} rx={4} ry={4} fill="#2563eb" />
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

  const info = cik != null ? cikToTicker(cik) : null;
  const displayTicker = (info?.ticker ?? tickerParam ?? '').toUpperCase();
  const companyName = formatCompanyName(warehouseName ?? info?.name ?? displayTicker);
  const listedExchange = info?.exchange ?? '';

  const incomeRows: { label: string; value: number | null; kind: CellKind }[] = selected
    ? [
        { label: 'Revenue', value: selected.revenue, kind: 'dollars' },
        { label: 'Operating expense', value: selected.operatingExpense === null ? null : Math.abs(selected.operatingExpense), kind: 'dollars' },
        { label: 'Net income', value: selected.netIncome, kind: 'dollars' },
        { label: 'Net profit margin', value: selected.netProfitMargin, kind: 'percent' },
        { label: 'Earnings per share', value: selected.eps, kind: 'pershare' },
        { label: 'Effective tax rate', value: selected.effectiveTaxRate, kind: 'percent' },
      ]
    : [];

  const balanceRows: { label: string; value: number | null; kind: CellKind }[] = selected
    ? [
        { label: 'Total assets', value: selected.totalAssets, kind: 'dollars' },
        { label: 'Total liabilities', value: selected.totalLiabilities, kind: 'dollars' },
        { label: 'Total equity', value: selected.totalEquity, kind: 'dollars' },
        { label: 'Cash and short term investments', value: selected.cashAndShortTermInvestments, kind: 'dollars' },
        { label: 'Book value per share', value: selected.bookValuePerShare, kind: 'pershare' },
      ]
    : [];

  const cashFlowRows: { label: string; value: number | null; kind: CellKind }[] = selected
    ? [
        { label: 'Net Income', value: selected.netIncome, kind: 'dollars' },
        { label: 'Operating Cash Flow', value: selected.operatingCashFlow, kind: 'dollars' },
        { label: 'Investing Cash Flow', value: selected.investingCashFlow, kind: 'dollars' },
        { label: 'Financing Cash Flow', value: selected.financingCashFlow, kind: 'dollars' },
        { label: 'Net Change in Cash', value: selected.netChangeInCash, kind: 'dollars' },
        { label: 'Free Cash Flow', value: selected.freeCashFlow, kind: 'dollars' },
      ]
    : [];

  const MetricsTable = ({ rows }: { rows: { label: string; value: number | null; kind: CellKind }[] }) => (
    <table className="w-full mt-4 text-sm border-t">
      <thead>
        <tr className="text-left text-gray-400 border-b">
          <th className="py-2">(USD)</th>
          <th className="py-2">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, value, kind }) => (
          <tr key={label} className="border-b">
            <td className="py-2">{label}</td>
            <td className="py-2 font-medium">{renderCell(value, kind)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <main className="p-8">
      <h1>{listedExchange.toUpperCase()}</h1>
      <h1 className="text-2xl font-bold mb-4">{companyName}</h1>

      {!tickerParam && (
        <p className="text-gray-500">Search for a company to view its fundamentals.</p>
      )}

      {tickerParam && cik != null && (
        <div className="mt-2 flex gap-2 border-b">
          {(['overview', 'statements'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'overview' ? 'Overview' : 'Financial Statements'}
            </button>
          ))}
        </div>
      )}

      {tab === 'statements' && cik != null && <StatementsView cik={cik} />}

      {tab === 'overview' && tickerParam && !loading && overview.length === 0 && (
        <p className="text-gray-500 mt-4">No data available for {displayTicker}.</p>
      )}

      {tab === 'overview' && overview.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-2">Revenue vs Net Income for {displayTicker}</h2>
          <div className="w-[95%] mx-auto">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={incomeChartData}
                margin={{ top: 30, right: 30, left: 0, bottom: 0 }}
                onClick={(e) => {
                  if (e && e.activeLabel) {
                    const year = parseInt(e.activeLabel.toString(), 10);
                    if (!isNaN(year)) setSelectedYear(year);
                  }
                }}
              >
                <XAxis
                  dataKey="year"
                  axisLine={false}
                  tick={(props) => (
                    <CustomXAxisTick {...props} onClick={(year: number) => setSelectedYear(year)} />
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
                <Bar dataKey="revenue" fill="#8884d8" name="Revenue">
                  <LabelList content={renderCustomBarLabel} />
                </Bar>
                <Bar dataKey="netIncome" fill="#82ca9d" name="Net Income">
                  <LabelList content={renderCustomBarLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {selectedYear && (
              <div className="mt-8 w-[95%] mx-auto">
                <details className="rounded-md p-4" open>
                  <summary className="cursor-pointer text-lg font-semibold mb-2">
                    Income Statement – {selectedYear}
                  </summary>
                  <div className="mt-4">
                    {selected ? <MetricsTable rows={incomeRows} /> : <p className="text-gray-500">No data available.</p>}
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
                  <div className="mt-8">
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart
                        data={balanceChartData}
                        margin={{ top: 30, right: 30, left: 0, bottom: 0 }}
                        onClick={(e) => {
                          if (e && e.activeLabel) {
                            const year = parseInt(e.activeLabel.toString(), 10);
                            if (!isNaN(year)) setSelectedYear(year);
                          }
                        }}
                      >
                        <XAxis
                          dataKey="year"
                          tick={(props) => (
                            <CustomXAxisTick {...props} onClick={(year: number) => setSelectedYear(year)} />
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
                        <Bar dataKey="assets" fill="#8884d8" name="Total Assets">
                          <LabelList content={renderCustomBarLabel} />
                        </Bar>
                        <Bar dataKey="liabilities" fill="#82ca9d" name="Total Liabilities">
                          <LabelList content={renderCustomBarLabel} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {selected ? <MetricsTable rows={balanceRows} /> : <p className="text-gray-500">No data available.</p>}
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
                  <div className="mt-8">
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart
                        data={cashFlowChartData}
                        margin={{ top: 30, right: 30, left: 0, bottom: 0 }}
                        onClick={(e) => {
                          if (e && e.activeLabel) {
                            const year = parseInt(e.activeLabel.toString(), 10);
                            if (!isNaN(year)) setSelectedYear(year);
                          }
                        }}
                      >
                        <XAxis
                          dataKey="year"
                          axisLine={false}
                          tick={(props) => (
                            <CustomXAxisTick {...props} onClick={(year: number) => setSelectedYear(year)} />
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
                    {selected ? <MetricsTable rows={cashFlowRows} /> : <p className="text-gray-500">No data available.</p>}
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

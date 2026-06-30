// src/app/dashboard/page.tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { getAnnualOverview, getCompanyName } from '@/lib/warehouse';
import { AnnualOverview } from '@/lib/types';
import { tickerToCik, cikToTicker } from '@/lib/tickers';
import { formatCompanyName } from '@/lib/company-name';
import { Spinner } from '@/components/spinner';

// Recharts (~heavy) and the Statements tab are only needed conditionally, so
// keep them out of the initial route bundle and load them on demand.
const importOverviewCharts = () => import('./overview-charts');
const OverviewCharts = dynamic(importOverviewCharts, {
  ssr: false,
  loading: () => <Spinner className="mt-8 py-20" />,
});
const StatementsView = dynamic(() => import('./statements-view'), {
  ssr: false,
  loading: () => <Spinner className="mt-8 py-20" />,
});

// Resolve a ?ticker= value to a CIK: try the SEC ticker map first, then fall
// back to treating the value itself as a raw CIK.
const resolveCik = (raw: string | null): number | null => {
  if (!raw) return null;
  const fromTicker = tickerToCik(raw);
  if (fromTicker != null) return fromTicker;
  const asNum = parseInt(raw, 10);
  return isNaN(asNum) ? null : asNum;
};

function Dashboard() {
  const searchParams = useSearchParams();
  const tickerParam = searchParams.get('ticker');
  const cik = resolveCik(tickerParam);

  const [overview, setOverview] = useState<AnnualOverview[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  // Start in the loading state when we already have a company to fetch, so the
  // first paint shows the spinner instead of a flash of "No data available".
  const [loading, setLoading] = useState(cik != null);
  const [tab, setTab] = useState<'overview' | 'statements'>('overview');
  const [warehouseName, setWarehouseName] = useState<string | null>(null);

  useEffect(() => {
    if (cik == null) {
      setOverview([]);
      setLoading(false);
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

  // Prefetch the heavy recharts chunk alongside the data fetch so its cold
  // download/parse overlaps the round trip instead of stacking after it.
  useEffect(() => {
    if (cik != null) void importOverviewCharts();
  }, [cik]);

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

  const info = cik != null ? cikToTicker(cik) : null;
  const displayTicker = (info?.ticker ?? tickerParam ?? '').toUpperCase();
  const companyName = formatCompanyName(warehouseName ?? info?.name ?? displayTicker);
  const listedExchange = info?.exchange ?? '';

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

      {tab === 'overview' && loading && <Spinner className="mt-8 py-20" />}

      {tab === 'overview' && tickerParam && !loading && overview.length === 0 && (
        <p className="text-gray-500 mt-4">No data available for {displayTicker}.</p>
      )}

      {tab === 'overview' && !loading && overview.length > 0 && (
        <OverviewCharts
          overview={overview}
          displayTicker={displayTicker}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
        />
      )}
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<Spinner className="mt-8 py-20" />}>
      <Dashboard />
    </Suspense>
  );
}

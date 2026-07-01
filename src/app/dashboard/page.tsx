'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { getAnnualOverview, getCompanyName } from '@/lib/warehouse';
import { AnnualOverview } from '@/lib/types';
import { tickerToCik, cikToTicker, loadTickerData } from '@/lib/tickers';
import { formatCompanyName } from '@/lib/company-name';
import { Spinner } from '@/components/spinner';
import { ErrorState } from '@/components/error-state';
import FeaturedCompanies from './featured-companies';

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

  // The ticker->CIK map loads lazily (see tickers.ts). Always start "not ready"
  // so the server's first render and the client's first render agree: the map is
  // a module singleton that can be warm on the server but is always cold on a
  // fresh client, so reading it during render would cause a hydration mismatch.
  // The client-only effect flips it on, then we resolve the ticker.
  const [tickerReady, setTickerReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadTickerData()
      .then(() => { if (!cancelled) setTickerReady(true); })
      .catch(() => { if (!cancelled) setTickerReady(true); });
    return () => { cancelled = true; };
  }, []);

  // Resolve only once the map is ready so all derived display values (exchange,
  // company name, tabs) are identical on the first server/client paint.
  const cik = tickerReady ? resolveCik(tickerParam) : null;
  const resolving = tickerParam != null && cik == null && !tickerReady;

  const [overview, setOverview] = useState<AnnualOverview[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  // Start in the loading state when there's a company in the URL to fetch, so
  // the first paint shows the spinner instead of a flash of "No data available"
  // (covers the window while the ticker map is still resolving the CIK).
  const [loading, setLoading] = useState(tickerParam != null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<'overview' | 'statements'>('overview');
  const [warehouseName, setWarehouseName] = useState<string | null>(null);

  useEffect(() => {
    if (cik == null) {
      // Still resolving ticker->CIK: keep showing the spinner, don't fall
      // through to the empty/"no data" state yet.
      if (resolving) return;
      setOverview([]);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const rows = await getAnnualOverview(cik);
        if (!cancelled) setOverview(rows);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch overview:', err);
          setOverview([]);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cik, reloadKey, resolving]);

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
  }, [cik, reloadKey]);

  const info = cik != null ? cikToTicker(cik) : null;
  const displayTicker = (info?.ticker ?? tickerParam ?? '').toUpperCase();
  const companyName = formatCompanyName(warehouseName ?? info?.name ?? displayTicker);
  const listedExchange = info?.exchange ?? '';

  return (
    <main className="p-8">
      {listedExchange && (
        <p className="text-sm text-gray-400">{listedExchange.toUpperCase()}</p>
      )}
      {companyName && <h1 className="text-2xl font-bold mb-4">{companyName}</h1>}

      {!tickerParam && (
        <FeaturedCompanies ready={tickerReady} />
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
                  : 'border-transparent text-gray-300 hover:text-gray-200'
              }`}
            >
              {t === 'overview' ? 'Overview' : 'Financial Statements'}
            </button>
          ))}
        </div>
      )}

      {/* Reserve vertical space while a company is loading so the spinner->charts
          swap doesn't shove the footer down on cold loads (the footer otherwise
          starts in-viewport and shifting it dominates CLS). */}
      <div className={tickerParam ? 'min-h-[820px]' : ''}>
        {tab === 'statements' && cik != null && <StatementsView cik={cik} />}

        {/* The LCP element. Render it as soon as the ticker is known — not gated
            on the data fetch or the lazy recharts chunk — so LCP tracks FCP
            instead of the chart mount. */}
        {tab === 'overview' && tickerParam && !error && (loading || overview.length > 0) && (
          <h2 className="text-xl font-semibold mt-8 mb-2">
            Revenue vs Net Income for {displayTicker}
          </h2>
        )}

        {tab === 'overview' && loading && <Spinner className="py-20" />}

        {tab === 'overview' && !loading && error && (
          <ErrorState
            message={`Couldn't load data for ${displayTicker}. Check your connection and try again.`}
            onRetry={() => setReloadKey((k) => k + 1)}
            className="mt-8 py-20"
          />
        )}

        {tab === 'overview' && tickerParam && !loading && !error && overview.length === 0 && (
          <p className="text-gray-500 mt-4">No data available for {displayTicker}.</p>
        )}

        {tab === 'overview' && !loading && !error && overview.length > 0 && (
          <OverviewCharts
            overview={overview}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
          />
        )}
      </div>
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

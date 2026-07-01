'use client';

import Link from 'next/link';
import { FEATURED_TICKERS } from '@/lib/featured-companies';
import { cikToTicker, tickerToCik } from '@/lib/tickers';
import { formatCompanyName } from '@/lib/company-name';

export default function FeaturedCompanies({ ready }: { ready: boolean }) {
  const companies = FEATURED_TICKERS.map((ticker) => {
    const cik = ready ? tickerToCik(ticker) : null;
    const info = cik != null ? cikToTicker(cik) : null;
    return {
      ticker,
      companyName: info?.name ?? ticker,
      listedExchange: info?.exchange ?? '',
    };
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-12rem)] w-full">
      <div className="w-full max-w-md text-center">
        <h2 className="text-lg font-semibold text-white mb-1">Start here</h2>
        <p className="text-sm text-gray-400 mb-4">Or search for any company above.</p>
        <ul className="rounded-md border border-gray-700 divide-y divide-gray-700 text-left">
        {companies.map(({ ticker, companyName, listedExchange }) => (
          <li key={ticker}>
            <Link
              href={`/dashboard?ticker=${ticker}`}
              className="block px-4 py-3 transition-colors hover:bg-white/5"
            >
              <span className="font-medium">{formatCompanyName(companyName)}</span>
              <span className="mt-0.5 block text-sm text-gray-400">
                {ticker}
                {listedExchange ? ` · ${listedExchange}` : ''}
              </span>
            </Link>
          </li>
        ))}
        </ul>
      </div>
    </div>
  );
}

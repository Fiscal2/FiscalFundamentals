'use client';

import { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import { StockItem } from '@/app/lib/types';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function StockSearch({
  allTickers,
  onSelect,
  navigateToDashboard = false
}: {
  allTickers: StockItem[];
  onSelect: (ticker: string) => void;
  navigateToDashboard?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [filtered, setFiltered] = useState<StockItem[]>([]);
  const router = useRouter();

  const fuse = useMemo(() => {
    return new Fuse(allTickers, {
        keys: ['ticker', 'companyName'],
        threshold: 0.4, // adjust as needed
        ignoreLocation: true
    });
    }, [allTickers]);

  useEffect(() => {
    if (search.trim() === '') {
        setFiltered([]);
        return;
    }

    const results = fuse.search(search.trim());
    console.log(results)
    setFiltered(results.map(r => r.item));
  }, [search, fuse]);

    function handleSelect(ticker: string) {
        if (navigateToDashboard) {
        router.push(`/dashboard?ticker=${ticker}`);
        } else {
        onSelect(ticker);
        }
        setSearch('');
        setFiltered([]);
    }

   function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const match = filtered[0];

      if (match) {
        handleSelect(match.ticker);
      }
    }
  }

  function formatCompanyName(name: string): string {
  return name.replace(/[^A-Z0-9 ]/gi, '').toUpperCase().trim();
}

  return (
    <div className="relative mb-4 w-full max-w-sm">
      <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500 pointer-events-none" />
      <input
        type="text"
        placeholder="Search by ticker or company name"
        className="w-full rounded-md text-white placeholder-neutral-500 border border-white/10 px-10 py-2 focus-visible:ring-2 focus-visible:ring-white/20"
        onKeyDown={handleKeyDown}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md bg-white shadow-md dark:bg-neutral-900">
          {filtered.map(({ ticker, companyName }) => (
            <li
              key={ticker}
              className="cursor-pointer px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => handleSelect(ticker)}
            >
              <span className="font-semibold">{ticker}</span> — {formatCompanyName(companyName)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
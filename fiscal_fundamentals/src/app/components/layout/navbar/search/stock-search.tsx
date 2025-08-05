'use client';

import { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import { StockItem } from '@/app/lib/types';
import { useRouter } from 'next/navigation';

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
      <input
        type="text"
        placeholder="Search by ticker or company name"
        className="w-full rounded-md border border-gray-300 p-2 dark:bg-neutral-800 dark:text-white"
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
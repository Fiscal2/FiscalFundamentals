'use client';

import { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import { StockItem } from '@/app/lib/types';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import MobileSearchModal from '../mobile-search-modal';

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
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();

  const fuse = useMemo(() => {
    return new Fuse(allTickers, {
        keys: ['ticker', 'companyName', 'listedExchange'],
        threshold: 0.4, 
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
        setSearchOpen(false)
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
  return name.replace(/[^A-Z0-9 .&]/gi, '').toUpperCase().trim();
}

 return (
    <div className="relative w-full max-w-sm">
        {/* Mobile search icon button (right aligned) */}
        <div className="md:hidden flex justify-end pr-4">
        <button
            onClick={() => setSearchOpen(true)}
            aria-label="Open search"
            className="p-2"
        >
            <MagnifyingGlassIcon className="w-7 h-7 text-white" />
        </button>
        </div>

        {/* Mobile modal (only when searchOpen is true) */}
        {searchOpen && (
        <MobileSearchModal
            search={search}
            setSearch={setSearch}
            filtered={filtered}
            onClose={() => setSearchOpen(false)}
            onSelect={handleSelect}
            handleKeyDown={handleKeyDown}
            formatCompanyName={formatCompanyName}
        />
        )}

        {/* Desktop search bar (visible only on md and up) */}
        <div className="hidden md:block">
        <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500 pointer-events-none" />
            <input
            type="text"
            placeholder="Search by ticker or company name"
            className="w-full rounded-md text-white placeholder-neutral-500 border border-white/10 px-10 py-2 focus-visible:ring-2 focus-visible:ring-white/20"
            onKeyDown={handleKeyDown}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            />
        </div>

        {/* Dropdown for desktop */}
        {filtered.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-md bg-white shadow-md dark:bg-neutral-900">
            {filtered.slice(0, 5).map(({ ticker, companyName, listedExchange },) => (
                <li
                key={ticker}
                className="cursor-pointer px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => handleSelect(ticker)}
                >
                <div className="flex flex-col">
                    <span className="font-medium">{formatCompanyName(companyName)}</span>
                    <span className="text-sm text-gray-400">{ticker} - {listedExchange}</span>
                </div>
                </li>
            ))}
            </ul>
        )}
        </div>
    </div>
  );
}
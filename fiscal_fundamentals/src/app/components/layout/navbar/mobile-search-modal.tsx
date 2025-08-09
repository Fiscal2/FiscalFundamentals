'use client';

import { useEffect } from 'react';
import { StockItem } from '@/app/lib/types';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface Props {
  search: string;
  setSearch: (val: string) => void;
  filtered: StockItem[];
  onClose: () => void;
  onSelect: (ticker: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  formatCompanyName: (name: string) => string;
}

export default function MobileSearchModal({
  search,
  setSearch,
  filtered,
  onClose,
  onSelect,
  handleKeyDown,
  formatCompanyName,
}: Props) {
  // Optional: prevent background scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-white text-lg font-medium">Search</h2>
        <button onClick={onClose} className="text-white text-2xl">×</button>
      </div>
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Search by ticker or company name"
          className="w-full rounded-md text-white placeholder-neutral-500 border border-white/10 px-10 py-2 bg-neutral-900"
          onKeyDown={handleKeyDown}
          value={search}
          autoFocus
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {filtered.length > 0 && (
        <ul className="mt-4 w-full rounded-md bg-white shadow-md dark:bg-neutral-900">
          {filtered.slice(0, 8).map(({ ticker, companyName }) => (
            <li
              key={ticker}
              className="cursor-pointer px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => onSelect(ticker)}
            >
              <span className="font-semibold">{ticker}</span> — {formatCompanyName(companyName)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
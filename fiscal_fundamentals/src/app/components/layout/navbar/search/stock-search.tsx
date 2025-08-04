'use client';

import { useState, useEffect } from 'react';

export default function StockSearch({
  allTickers,
  onSelect
}: {
  allTickers: string[];
  onSelect: (ticker: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [filtered, setFiltered] = useState<string[]>([]);

  useEffect(() => {
    if (search.trim() === '') {
      setFiltered([]);
      return;
    }

    const query = search.toLowerCase();
    setFiltered(
      allTickers.filter((ticker) => ticker.toLowerCase().includes(query))
    );
  }, [search, allTickers]);

   function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const match =
        filtered[0] || allTickers.find(t => t.toLowerCase() === search.toLowerCase());

      if (match) {
        onSelect(match);
        setSearch('');
        setFiltered([]);
      }
    }
  }

  return (
    <div className="relative mb-4 w-full max-w-sm">
      <input
        type="text"
        placeholder="Search a stock (e.g., TSLA, AAPL)"
        className="w-full rounded-md border border-gray-300 p-2 dark:bg-neutral-800 dark:text-white"
        onKeyDown={handleKeyDown}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md bg-white shadow-md dark:bg-neutral-900">
          {filtered.map((ticker) => (
            <li
              key={ticker}
              className="cursor-pointer px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => {
                onSelect(ticker);
                setSearch('');
                setFiltered([]);
              }}
            >
              {ticker}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
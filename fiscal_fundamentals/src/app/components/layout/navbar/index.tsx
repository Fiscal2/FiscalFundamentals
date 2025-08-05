// components/navbar/index.tsx
'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import MobileMenu from './mobile-menu';
import Image from 'next/image';
import StockSearch from './search/stock-search';
import { StockItem } from '@/app/lib/types';

const SITE_NAME_LINE_1 = 'Castling';
const SITE_NAME_LINE_2 = 'Financial';

const MENU_ITEMS = [
  { title: 'Home', path: '/' },
  { title: 'About', path: '/about' },
  { title: 'Services', path: '/' },
  { title: 'Contact', path: '/' }
];


export function Navbar() {
  const [tickers, setTickers] = useState<StockItem[]>([]);
  useEffect(() => {
    async function fetchTickers() {
      try {
        const res = await fetch('http://localhost:8000/api/financials');
        const json = (await res.json()) as {
            ticker: string;
            company_name?: string;
            quarter: number;
        }[];


        const unique: StockItem[] = Array.from(
            new Map(
                json
                .filter(row => row.quarter === 0)
                .map(row => [
                    row.ticker,
                    {
                    ticker: row.ticker,
                    companyName: row.company_name?.trim() || 'Unknown',
                    },
                ])
            ).values()
        );


        setTickers(unique);
      } catch (error) {
        console.error('Failed to fetch tickers:', error);
      }
    }

    fetchTickers();
  }, []);
  return (
    <nav className="relative flex items-center justify-between p-4 lg:px-6">
      <div className="block flex-none md:hidden">
        <Suspense fallback={null}>
          <MobileMenu menu={MENU_ITEMS} />
        </Suspense>
      </div>
      <div className="flex w-full items-center">
        <div className="ml-4 flex w-full md:w-1/3">
          <Link
            href="/"
            prefetch={true}
            className="mr-5 flex w-full items-center justify-center md:w-auto lg:mr-6"
          >
            <Image src="/castlingFinancialPieces.png" alt="Logo" width={50} height={50} />
            <div className="ml-4 mr-5 flex-none text-sm font-bold uppercase md:hidden lg:block">
              {SITE_NAME_LINE_1}<br />{SITE_NAME_LINE_2}
            </div>
          </Link>
          <ul className="hidden gap-6 text-sm md:flex md:items-center">
            {MENU_ITEMS.map((item) => (
              <li key={item.title}>
                <Link
                  href={item.path}
                  className="text-neutral-500 underline-offset-4 hover:text-black hover:underline dark:text-neutral-400 dark:hover:text-neutral-300"
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden justify-center md:flex md:w-1/3">
        </div>
        <div className="flex justify-end md:w-1/3" />
        <StockSearch allTickers={tickers} onSelect={() => {}} navigateToDashboard />
      </div>
    </nav>
  );
}
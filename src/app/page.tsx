'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FEATURED_TICKERS } from '@/lib/featured-companies';

const features = [
  {
    title: 'Filing-accurate data',
    description:
      'Every figure is the exact value reported in the company’s SEC XBRL filing — traceable to the source document.',
  },
  {
    title: 'Visual fundamentals',
    description:
      'Revenue, margins, balance sheet, and cash flow in interactive charts you can read at a glance.',
  },
  {
    title: 'Instant lookup',
    description:
      'Search any covered ticker and jump straight into multi-year overviews and full statements.',
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

export default function Homepage() {
  return (
    <main className="relative overflow-hidden">
      <section className="relative mx-auto flex min-h-[calc(100dvh-10rem)] max-w-5xl flex-col items-center justify-center px-6 py-20 text-center">
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <Image
            src="/castlingFinancialPieces.png"
            alt=""
            width={96}
            height={96}
            priority
            className="mx-auto rounded-2xl"
          />
        </motion.div>

        <motion.p
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-gray-400"
        >
          SEC fundamentals, simplified
        </motion.p>

        <motion.h1
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-6xl sm:leading-[1.1]"
        >
          Always two steps ahead.
        </motion.h1>

        <motion.p
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-300 sm:text-xl"
        >
          Castling turns dense SEC filings into clear, comparable financial insight — fast, clean, and
          built on the numbers companies actually reported.
        </motion.p>

        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-10"
        >
          <Link
            href="/dashboard"
            className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-gray-200"
          >
            Explore the dashboard
          </Link>
        </motion.div>

        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mt-12"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
            Popular companies
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {FEATURED_TICKERS.map((ticker) => (
              <Link
                key={ticker}
                href={`/dashboard?ticker=${ticker}`}
                className="rounded-full border border-gray-700 bg-white/5 px-4 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:border-gray-500 hover:bg-white/10 hover:text-white"
              >
                {ticker}
              </Link>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="relative border-t border-gray-800/80 px-6 pb-24 pt-20">
        <div className="mx-auto max-w-5xl">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-12 text-center"
          >
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Built for serious research</h2>
            <p className="mt-3 text-gray-400">
              No vendor feeds. No guesswork. Just the filing.
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-3">
            {features.map(({ title, description }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.35 + i * 0.08 }}
                className="rounded-xl border border-gray-800 bg-white/[0.02] p-6 transition-colors hover:border-gray-700 hover:bg-white/[0.04]"
              >
                <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">{description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

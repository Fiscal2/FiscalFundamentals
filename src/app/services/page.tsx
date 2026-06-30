'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

const services = [
  {
    title: 'Standardized Fundamentals',
    description:
      'We extract and normalize income statement, balance sheet, and cash flow data from SEC filings into a clean, consistent format you can actually compare across companies and years.',
  },
  {
    title: 'Visual Earnings Breakdowns',
    description:
      'Interactive charts turn raw filings into clear views of revenue, net income, assets, liabilities, and cash flow — so you can spot trends at a glance.',
  },
  {
    title: 'Financial Statement Explorer',
    description:
      'Drill into a company’s annual statements year by year, with the underlying line items mapped to familiar metrics.',
  },
  {
    title: 'Fast Company Search',
    description:
      'Look up any covered public company by ticker and jump straight to its fundamentals.',
  },
];

export default function ServicesPage() {
  return (
    <main className="flex flex-col items-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl w-full"
      >
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 text-center">Services</h1>
        <p className="text-lg text-gray-300 mb-12 text-center">
          Castling Financial turns dense SEC filings into clear, comparable financial insight.
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          {services.map(({ title, description }) => (
            <div key={title} className="rounded-lg border border-gray-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
              <p className="text-gray-300">{description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/dashboard"
            className="inline-block rounded-full border border-gray-600 px-6 py-2 text-sm font-medium transition-colors hover:bg-white/10"
          >
            Explore the dashboard
          </Link>
        </div>
      </motion.div>
    </main>
  );
}

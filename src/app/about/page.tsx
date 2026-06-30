'use client';

import { motion } from 'framer-motion';

export default function AboutPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl text-center"
      >
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6">
          About Castling Financial
        </h1>
        <p className="text-lg text-gray-300 mb-4">
          Castling Financial is built for investors, analysts, and anyone curious about how companies perform.
        </p>
        <p className="text-lg text-gray-300 mb-4">
          We extract, standardize, and visualize earnings data from SEC filings to help you cut through the noise and focus on what matters.
        </p>
        <p className="text-lg text-gray-300 mb-4">
          Whether you&apos;re screening stocks, studying financials, or comparing metrics - Castling helps you move like a Grandmaster, always two steps ahead.
        </p>
        <p className="text-lg text-gray-300">
          Honestly, it started out of frustration. Pulling the numbers you actually need meant bouncing between Google Finance, Yahoo Finance, and a dozen other financial sites - each with slow, clunky UIs that made simple research feel like a chore. Castling exists to make that data fast, clean, and trustworthy to get to.
        </p>

        <h2 className="text-3xl font-bold text-white mt-12 mb-4">Data Accuracy</h2>
        <p className="text-lg text-gray-300 text-left">
          Every figure in our 2024/2025 data is the exact value the company itself reported to the SEC in its official XBRL filing - not an estimate or a re-derived number. For any data point we can hand you the precise filing (accession number), the exact tag, the period, and the units it came from. We never alter the underlying value, and we use exact decimal math so nothing rounds or drifts. We verify it three independent ways: it ties back bit-for-bit to the SEC&apos;s bulk source files, it matches the SEC&apos;s separate company-facts API to the penny, and every statement internally reconciles (the balance sheet balances, the cash flow ties out). Yahoo and Google normalize and recompute figures from vendor feeds, which is where transformation errors creep in and why their numbers sometimes disagree with the filing - we carry the filing&apos;s own numbers, with a traceable link back to the document.
        </p>
      </motion.div>
    </main>
  );
}

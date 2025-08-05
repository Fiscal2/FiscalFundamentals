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
        <p className="text-lg text-gray-300">
          Whether you&apos;re screening stocks, studying financials, or comparing metrics - Castling helps you move like a Grandmaster, always two steps ahead.
        </p>
      </motion.div>
    </main>
  );
}

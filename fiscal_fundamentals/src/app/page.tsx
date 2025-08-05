// src/app/homepage/page.tsx
'use client';

import { motion } from 'framer-motion';



export default function Homepage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl text-center"
      >
        <h1 className="text-4xl sm:text-5xl font-bold text-white-900 mb-6">
          Welcome to Castling Financial
        </h1>
        <p className="text-lg text-gray-300 mb-8">
          Your strategic dashboard for financial insights. Analyze, compare, and break down earnings with clarity and speed.
        </p>

        <div className="flex justify-center gap-4">
        </div>
      </motion.div>
    </main>
  );
}

'use client';

import { motion } from 'framer-motion';
import { LEGAL } from '@/lib/legal';

export default function ContactPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-xl text-center"
      >
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6">Get in touch</h1>
        <p className="text-lg text-gray-300 mb-8">
          Questions, feedback, or found something that looks off in the data? We’d love to hear
          from you.
        </p>

        <a
          href={`mailto:${LEGAL.contactEmail}`}
          className="inline-block rounded-full border border-gray-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-white/10"
        >
          {LEGAL.contactEmail}
        </a>

        <p className="mt-8 text-sm text-gray-500">
          We typically respond within a few business days.
        </p>
      </motion.div>
    </main>
  );
}

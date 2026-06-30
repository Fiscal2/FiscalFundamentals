import type { ReactNode } from 'react';

export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">{title}</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: {lastUpdated}</p>
      <div className="space-y-8 text-gray-300 leading-relaxed">{children}</div>
    </main>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{heading}</h2>
      {children}
    </section>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { getFilings, getStatements } from '@/app/lib/warehouse';
import {
  FilingMeta,
  LineItemRow,
  Statements,
  StatementCode,
} from '@/app/lib/types';

const STATEMENT_TITLES: Record<StatementCode, string> = {
  IS: 'Income Statement',
  BS: 'Balance Sheet',
  CF: 'Cash Flow Statement',
};

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const sharesFormatter = new Intl.NumberFormat('en-US');

// Format a line value according to its unit of measure. USD covers both large
// dollar amounts and small per-share figures (par value, EPS); `shares` is a
// plain count; anything else falls back to "<number> <uom>".
function formatAmount(value: number | null, uom: string): string {
  if (value === null) return '';
  if (uom === 'USD') return usdFormatter.format(value);
  if (uom === 'shares') return sharesFormatter.format(value);
  return `${sharesFormatter.format(value)} ${uom}`;
}

function filingLabel(f: FilingMeta): string {
  const parts = [f.form];
  if (f.fp || f.fy) parts.push([f.fp, f.fy].filter(Boolean).join(' '));
  const period = f.period ?? f.filed ?? '';
  return `${parts.join(' ')}${period ? ` — ${period}` : ''}`;
}

function StatementTable({
  rows,
  shareRows,
}: {
  rows: LineItemRow[];
  shareRows: LineItemRow[];
}) {
  if (rows.length === 0 && shareRows.length === 0) {
    return <p className="text-gray-500 text-sm">No data for this statement.</p>;
  }

  const renderRows = (items: LineItemRow[]) =>
    items.map((r, i) => (
      <tr key={`${r.line}-${r.tag}-${r.ddate}-${i}`} className="border-b border-gray-100">
        <td className="py-1.5 pr-4">{r.plabel ?? r.tag}</td>
        <td className="py-1.5 text-right tabular-nums font-medium whitespace-nowrap">
          {formatAmount(r.value, r.uom)}
        </td>
      </tr>
    ));

  return (
    <table className="w-full text-sm border-t">
      <tbody>
        {renderRows(rows)}
        {shareRows.length > 0 && (
          <>
            <tr>
              <td colSpan={2} className="pt-4 pb-1 text-xs uppercase tracking-wide text-gray-400">
                Share data
              </td>
            </tr>
            {renderRows(shareRows)}
          </>
        )}
      </tbody>
    </table>
  );
}

export default function StatementsView({ cik }: { cik: number }) {
  const [filings, setFilings] = useState<FilingMeta[]>([]);
  const [filingsLoaded, setFilingsLoaded] = useState(false);
  const [selectedAdsh, setSelectedAdsh] = useState<string>('');
  const [statements, setStatements] = useState<Statements | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFilingsLoaded(false);
    (async () => {
      try {
        const list = await getFilings(cik);
        if (cancelled) return;
        setFilings(list);
        const latest10K = list.find((f) => f.form === '10-K') ?? list[0];
        setSelectedAdsh(latest10K?.adsh ?? '');
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch filings:', err);
          setFilings([]);
          setSelectedAdsh('');
        }
      } finally {
        if (!cancelled) setFilingsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [cik]);

  useEffect(() => {
    if (!selectedAdsh) {
      setStatements(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const s = await getStatements(selectedAdsh);
        if (!cancelled) setStatements(s);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch statements:', err);
          setStatements(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedAdsh]);

  const periodEnd = useMemo(
    () => filings.find((f) => f.adsh === selectedAdsh)?.period ?? null,
    [filings, selectedAdsh]
  );

  if (!filingsLoaded) {
    return <p className="text-gray-500 mt-4">Loading filings…</p>;
  }

  if (filings.length === 0) {
    return <p className="text-gray-500 mt-4">No filings available for this company.</p>;
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-6">
        <label htmlFor="filing-select" className="text-sm text-gray-500">
          Filing
        </label>
        <select
          id="filing-select"
          value={selectedAdsh}
          onChange={(e) => setSelectedAdsh(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm bg-transparent"
        >
          {filings.map((f) => (
            <option key={f.adsh} value={f.adsh}>
              {filingLabel(f)}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-gray-500">Loading statements…</p>}

      {!loading && statements && (
        <div className="space-y-10">
          {(['IS', 'BS', 'CF'] as StatementCode[]).map((code) => (
            <section key={code}>
              <h3 className="text-lg font-semibold mb-1">{STATEMENT_TITLES[code]}</h3>
              {periodEnd && (
                <p className="text-xs text-gray-400 mb-2">Period ended {periodEnd} · USD</p>
              )}
              <StatementTable
                rows={statements[code].rows}
                shareRows={statements[code].shareRows}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

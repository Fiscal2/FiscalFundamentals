// src/app/lib/xbrl.ts
export type ReportValue = { label?: string; value?: number };
export type ReportMap = Record<string, ReportValue>;

/**
 * Returns the first numeric value found for any of the given XBRL tags.
 * Also checks for "defref_"-prefixed keys.
 */
export function getTagValue(
  map: ReportMap,
  tags: string[]
): number | null {
  for (const t of tags) {
    const hit = map[t];
    if (hit && typeof hit.value === 'number') return hit.value;

    const defref = map[`defref_${t}`];
    if (defref && typeof defref.value === 'number') return defref.value;
  }
  return null;
}
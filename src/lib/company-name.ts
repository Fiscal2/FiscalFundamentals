import { properCaseToken } from './tickers';

// SEC company names arrive in inconsistent casing (mostly ALL CAPS) with EDGAR
// bookkeeping suffixes appended. `formatCompanyName` turns them into a clean,
// human display form. Shared by the dashboard header and the search dropdown so
// both render names identically.

const EXCEPTIONS = [
  'PG&E', 'NVIDIA', 'HP', 'W.W.', 'CBRE', 'TE', 'EQT', 'HCA', 'EOG', 'ON',
  'M&T', 'KKR', 'KLA', 'MGM', 'EPAM', 'BIO-TECHNE', 'CBOE', 'PLC', 'LLC', 'SAP',
];

// Manual casing, keyed by the punctuation-stripped lowercased token. Covers the
// corporate-suffix expansion plus famous brands the SEC stores in ALL CAPS that
// the automatic camelCase detection in tickers.ts can't recover.
const OVERRIDES: Record<string, string> = {
  corp: 'Corporation',
  co: 'Company',
  conocophillips: 'ConocoPhillips',
  astrazeneca: 'AstraZeneca',
  unitedhealth: 'UnitedHealth',
  jpmorgan: 'JPMorgan',
  ebay: 'eBay',
  nextera: 'NextEra',
  jetblue: 'JetBlue',
  pepsico: 'PepsiCo',
  autozone: 'AutoZone',
  autonation: 'AutoNation',
  resmed: 'ResMed',
  dexcom: 'DexCom',
  factset: 'FactSet',
  lululemon: 'lululemon',
  mcdonalds: "McDonald's",
  'freeport-mcmoran': 'Freeport-McMoRan',
};

// Entity-type designations that appear as the final token, keyed by the token
// with all punctuation removed. The generic title-caser would otherwise lower
// the trailing letters (e.g. "S.A." -> "S.a.", "SPA" -> "Spa"). Only applied to
// the last token so real words mid-name (e.g. "Ballston Spa Bancorp") are safe.
const ENTITY_FORMS: Record<string, string> = {
  sa: 'S.A.',
  spa: 'S.p.A.',
  sab: 'S.A.B.',
  na: 'N.A.',
  nv: 'N.V.',
  as: 'A.S.',
  ag: 'AG',
  se: 'SE',
  ab: 'AB',
  oyj: 'Oyj',
};

// Entity designations that may legitimately contain a slash; used to avoid
// stripping the trailing part as if it were an EDGAR location code (e.g. the
// Belgian "Anheuser-Busch InBev SA/NV").
const ENTITY_BEFORE = /\b(?:SA|NV|AG|SE|AB|AS|BV|OY|AE|NA|PLC|SPA)$/i;

// Remove EDGAR's appended location / former-name / listing qualifiers, e.g.
// "ARM HOLDINGS PLC /UK", "QUALCOMM INC/DE", "PROGRESSIVE CORP/OH/",
// "TOYOTA MOTOR CORP/", "Siemens Energy AG/ADR".
function stripEdgarSuffix(raw: string): string {
  let s = raw.trim();
  // ADR listing qualifier is never part of the company name.
  s = s.replace(/\s*\/\s*ADR\b\/?\s*$/i, '').trim();
  for (;;) {
    // " /DE", " /CAN/", " / MA" — space-separated suffix.
    let m = s.match(/^(.*\S)\s+\/\s*[A-Za-z]{2,4}\/?\s*$/);
    if (m) { s = m[1].trim(); continue; }
    // Trailing bare slash, e.g. "TOYOTA MOTOR CORP/".
    m = s.match(/^(.*\S)\s*\/\s*$/);
    if (m) { s = m[1].trim(); continue; }
    // "INC/DE" — attached suffix, unless it's an entity designation.
    m = s.match(/^(.*?)\/\s*[A-Za-z]{2,4}\/?\s*$/);
    if (m && !ENTITY_BEFORE.test(m[1].trim())) { s = m[1].trim(); continue; }
    break;
  }
  return s;
}

export function formatCompanyName(str: string): string {
  const parts = stripEdgarSuffix(str).trim().toLowerCase().split(/\s+/);
  const lastIdx = parts.length - 1;

  const titled = parts
    .map((word, i) => {
      const key = word.replace(/^[^a-z0-9]+|[^a-z0-9&]+$/g, '');
      // Entity designation as the final token: "s.a." -> "S.A.".
      if (i === lastIdx) {
        const norm = word.replace(/[^a-z0-9]/g, '');
        if (ENTITY_FORMS[norm]) return ENTITY_FORMS[norm];
      }
      if (OVERRIDES[key]) return OVERRIDES[key];
      const auto = properCaseToken(word);
      if (auto) return auto;
      const upperWord = word.toUpperCase();
      if (EXCEPTIONS.includes(upperWord)) return upperWord;
      // Scottish/Irish "Mc" surnames: "mckesson" -> "McKesson".
      if (/^mc[a-z]{2,}$/.test(key)) {
        return 'Mc' + key.charAt(2).toUpperCase() + key.slice(3);
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');

  // Entity-type abbreviations stored as spaced single letters (the title-caser
  // can't know they're initialisms): "S P A" -> "S.p.A.", "N A" -> "N.A.",
  // "A S" -> "A.S.". End-anchored so they only match the trailing suffix.
  return titled
    .replace(/ Com\b/g, '.com')
    .replace(/\bS P A$/, 'S.p.A.')
    .replace(/\bN A$/, 'N.A.')
    .replace(/\bA S$/, 'A.S.');
}

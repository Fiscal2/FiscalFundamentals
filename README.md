# Castling Financial — SEC Fundamentals Dashboard

A Next.js (App Router) dashboard for exploring U.S. and foreign-issuer company
fundamentals sourced directly from SEC XBRL filings. Search a company and view a
multi-year Overview (revenue, margins, balance sheet, cash flow) and the full
Income Statement / Balance Sheet / Cash Flow for each filing.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4**
- **Recharts** for charts, **Fuse.js** for fuzzy search
- **Supabase** (Postgres warehouse) read directly from the client via `@supabase/supabase-js`

## Data Accuracy

Every figure in our 2024/2025 data is the exact value the company itself reported to the SEC in its official XBRL filing — not an estimate or a re-derived number. For any data point we can hand you the precise filing (accession number), the exact tag, the period, and the units it came from. We never alter the underlying value, and we use exact decimal math so nothing rounds or drifts. We verify it three independent ways: it ties back bit-for-bit to the SEC's bulk source files, it matches the SEC's separate company-facts API to the penny, and every statement internally reconciles (the balance sheet balances, the cash flow ties out). Yahoo and Google normalize and recompute figures from vendor feeds, which is where transformation errors creep in and why their numbers sometimes disagree with the filing — we carry the filing's own numbers, with a traceable link back to the document.

## Getting Started

```bash
npm install
cp .env.example .env   # then fill in your Supabase values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

See [`.env.example`](./.env.example). Required:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (browser-safe)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (browser-safe by design)

`.env` is gitignored and must never be committed.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint

## Architecture

- `src/app/lib/warehouse.ts` — Supabase data access + per-session caching. Owns
  *where rows come from*.
- `src/app/lib/xbrl.ts` — pure XBRL interpretation: tag dictionaries and the
  statement/Overview derivation. No network; unit-testable from row fixtures.
- `src/app/lib/company-name.ts` — display-name normalization (EDGAR suffix
  stripping, casing, entity forms) shared by the header and search.
- `src/app/lib/tickers.ts` — bundled SEC ticker ↔ CIK map.
- `src/app/dashboard/` — the dashboard route (`page.tsx`) and its colocated
  `statements-view.tsx`.

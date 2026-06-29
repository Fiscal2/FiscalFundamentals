This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Data Accuracy

Every figure in our 2024/2025 data is the exact value the company itself reported to the SEC in its official XBRL filing — not an estimate or a re-derived number. For any data point we can hand you the precise filing (accession number), the exact tag, the period, and the units it came from. We never alter the underlying value, and we use exact decimal math so nothing rounds or drifts. We verify it three independent ways: it ties back bit-for-bit to the SEC's bulk source files, it matches the SEC's separate company-facts API to the penny, and every statement internally reconciles (the balance sheet balances, the cash flow ties out). Yahoo and Google normalize and recompute figures from vendor feeds, which is where transformation errors creep in and why their numbers sometimes disagree with the filing — we carry the filing's own numbers, with a traceable link back to the document.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

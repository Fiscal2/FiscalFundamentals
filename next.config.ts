import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a fully static site to `out/` for hosting on Cloudflare Pages. The app
  // fetches all data client-side from Supabase, so no server runtime is needed.
  output: 'export',
  // Static export can't run Next's on-demand image optimizer; serve the local
  // logo assets as-is.
  images: { unoptimized: true },
};

export default nextConfig;

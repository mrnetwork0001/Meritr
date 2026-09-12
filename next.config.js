/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `next build` and `next dev` share .next by default, so verifying a build while the dev
  // server is running corrupts its chunk manifest: the HTML keeps returning 200 while every
  // JS chunk 404s, which presents as a blank page rather than a build error. Verification
  // builds set NEXT_DIST_DIR so they cannot touch the running server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    // The Meritr risk API. Override with NEXT_PUBLIC_MERITR_API when the backend is not local.
    NEXT_PUBLIC_MERITR_API: process.env.NEXT_PUBLIC_MERITR_API || "http://localhost:8010",
  },
};

module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // The Meritr risk API. Override with NEXT_PUBLIC_MERITR_API when the backend is not local.
    NEXT_PUBLIC_MERITR_API: process.env.NEXT_PUBLIC_MERITR_API || "http://localhost:8000",
  },
};

module.exports = nextConfig;

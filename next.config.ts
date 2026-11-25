import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Local-only: `next build` writes to its own directory so a running
  // `next dev` (.next) is never clobbered. Vercel expects the default .next.
  distDir:
    !process.env.VERCEL && process.env.NODE_ENV === "production"
      ? ".next-build"
      : ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
};

export default nextConfig;

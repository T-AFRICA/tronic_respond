import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `next build` writes to its own directory so a running `next dev` (.next)
  // is never clobbered by a production build on the same checkout.
  distDir: process.env.NODE_ENV === "production" ? ".next-build" : ".next",
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

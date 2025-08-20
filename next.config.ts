import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ✅ Ignores ESLint errors during builds (for Vercel)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

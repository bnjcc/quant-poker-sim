import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack scoped to this app when a parent directory also has a lockfile.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo root has its own lockfile, so name this app as the root explicitly.
  turbopack: { root: __dirname },
};

export default nextConfig;

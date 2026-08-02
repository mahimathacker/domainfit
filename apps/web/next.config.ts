import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  experimental: { optimizePackageImports: ["lucide-react"] },
};

export default nextConfig;

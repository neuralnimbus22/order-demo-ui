import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output so the Dockerfile (deployment chunk) can copy a
  // self-contained server instead of shipping node_modules.
  output: "standalone",
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a long-running dev server use its own build folder so `next build` cannot clobber it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;

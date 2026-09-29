import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a long-running dev server use its own build folder so `next build` cannot clobber it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: path.join(__dirname),
  // Markdown pages are read from disk at request time; make sure serverless/standalone builds ship them.
  outputFileTracingIncludes: { "/**": ["./content/**/*"] },
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: process.env.S3_PUBLIC_BASE_URL
      ? [{ protocol: "https", hostname: new URL(process.env.S3_PUBLIC_BASE_URL).hostname }]
      : [],
  },
};

export default nextConfig;

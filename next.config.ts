import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a long-running dev server use its own build folder so `next build` cannot clobber it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: path.join(__dirname),
  // Markdown pages are read from disk at request time; make sure serverless/standalone builds ship them.
  outputFileTracingIncludes: { "/**": ["./content/**/*"] },
  experimental: {
    // Server Actions default to a 1 MB body; image uploads allow up to 10 x 5 MB.
    serverActions: { bodySizeLimit: "55mb" },
  },
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: process.env.S3_PUBLIC_BASE_URL
      ? [{ protocol: "https", hostname: new URL(process.env.S3_PUBLIC_BASE_URL).hostname }]
      : [],
  },
};

export default nextConfig;

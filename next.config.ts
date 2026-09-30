import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a long-running dev server use its own build folder so `next build` cannot clobber it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: path.join(__dirname),
  // Markdown pages are read from disk at request time; make sure serverless/standalone builds ship them.
  outputFileTracingIncludes: { "/**": ["./content/**/*"] },
  experimental: {
    // Server Actions default to a 1 MB body. Images are uploaded one file per action call (see
    // ImageManager/HeroUploader), so this only needs headroom over MAX_UPLOAD_BYTES (5 MB) plus
    // multipart overhead — kept low because this limit applies to every Server Action, including
    // anonymous storefront ones.
    serverActions: { bodySizeLimit: "6mb" },
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

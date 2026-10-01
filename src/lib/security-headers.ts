// Imported by next.config.ts with a relative path: keep this file free of imports and path aliases.

/** Every path except user uploads and the image optimizer, which send their own restrictive image CSP. */
export const SECURITY_HEADER_SOURCE = "/((?!api/uploads/|_next/image).*)";

export interface CspOptions { dev: boolean; https: boolean; s3PublicBaseUrl?: string | null }

/** The checkout script itself always loads from this exact host. */
const RAZORPAY_SCRIPT = "https://checkout.razorpay.com";
/** Razorpay's iframe, XHR/fetch and sendBeacon telemetry use several subdomains it rotates
 * (api.razorpay.com, api-dark.razorpay.com, lumberjack-cx.razorpay.com, lumberjack-metrics…) —
 * a wildcard avoids refusing whichever one they're using this week. */
const RAZORPAY_ANY = "https://*.razorpay.com";
const GOOGLE = ["https://www.googletagmanager.com", "https://www.google-analytics.com", "https://*.google-analytics.com", "https://*.analytics.google.com"];
const META = ["https://connect.facebook.net", "https://www.facebook.com"];

function originOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp({ dev, https, s3PublicBaseUrl }: CspOptions): string {
  const s3 = originOf(s3PublicBaseUrl);
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), RAZORPAY_SCRIPT, "https://www.googletagmanager.com", "https://connect.facebook.net"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // "https:" already covers the S3 origin in production; adding it explicitly also allows a
    // plain-http dev/MinIO bucket (S3_PUBLIC_BASE_URL=http://localhost:9000/...). The studio loads
    // uploaded images through an <img> element (Fabric's FabricImage.fromURL), not fetch/XHR, so
    // this belongs in img-src, not connect-src.
    ["img-src", ["'self'", "data:", "blob:", "https:", ...(s3 ? [s3] : [])]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", RAZORPAY_ANY, ...GOOGLE, ...META, ...(dev ? ["ws:", "wss:"] : [])]],
    ["frame-src", ["'self'", RAZORPAY_ANY]],
    ["worker-src", ["'self'", "blob:"]],
    ["media-src", ["'self'", "data:", "blob:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'", "https://api.razorpay.com"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (https && !dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(opts: CspOptions): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp(opts) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com")' },
    // Razorpay opens UPI/net-banking popups that must be able to talk back to the opener.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}

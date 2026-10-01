// Imported by next.config.ts with a relative path: keep this file free of imports and path aliases.

/** Every path except user uploads and the image optimizer, which send their own restrictive image CSP. */
export const SECURITY_HEADER_SOURCE = "/((?!api/uploads/|_next/image).*)";

export interface CspOptions { dev: boolean; https: boolean; s3PublicBaseUrl?: string | null }

const RAZORPAY = ["https://checkout.razorpay.com", "https://api.razorpay.com", "https://lumberjack.razorpay.com"];
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
    ["script-src", ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), "https://checkout.razorpay.com", "https://www.googletagmanager.com", "https://connect.facebook.net"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...RAZORPAY, ...GOOGLE, ...META, ...(s3 ? [s3] : []), ...(dev ? ["ws:", "wss:"] : [])]],
    ["frame-src", ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"]],
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

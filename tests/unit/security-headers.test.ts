import { describe, expect, it } from "vitest";
import { buildCsp, SECURITY_HEADER_SOURCE, securityHeaders } from "@/lib/security-headers";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("security headers", () => {
  it("allows Razorpay checkout (its script host, and a wildcard for the hosts it rotates for telemetry/iframes) and the analytics hosts", () => {
    const csp = buildCsp({ dev: false, https: true });
    expect(directive(csp, "script-src")).toContain("https://checkout.razorpay.com");
    expect(directive(csp, "script-src")).toContain("https://*.razorpay.com");
    expect(directive(csp, "frame-src")).toContain("https://*.razorpay.com");
    expect(directive(csp, "connect-src")).toContain("https://*.razorpay.com");
    expect(directive(csp, "connect-src")).toContain("https://*.google-analytics.com");
    expect(directive(csp, "script-src")).toContain("https://connect.facebook.net");
    expect(directive(csp, "form-action")).toBe("form-action 'self' https://api.razorpay.com https://accounts.google.com");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
  });

  it("adds the Google Ads/doubleclick beacon hosts to connect-src only when GA is configured", () => {
    const off = buildCsp({ dev: false, https: true });
    expect(directive(off, "connect-src")).not.toContain("https://www.google.com");
    expect(directive(off, "connect-src")).not.toContain("https://*.g.doubleclick.net");
    const on = buildCsp({ dev: false, https: true, gaConfigured: true });
    expect(directive(on, "connect-src")).toContain("https://www.google.com");
    expect(directive(on, "connect-src")).toContain("https://*.g.doubleclick.net");
  });

  it("only relaxes for development and only upgrades requests behind https", () => {
    expect(buildCsp({ dev: false, https: true })).not.toContain("'unsafe-eval'");
    expect(buildCsp({ dev: false, https: true })).toContain("upgrade-insecure-requests");
    expect(buildCsp({ dev: false, https: false })).not.toContain("upgrade-insecure-requests");
    const dev = buildCsp({ dev: true, https: false });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
  });

  it("adds the S3 origin to img-src (not connect-src) when configured", () => {
    const csp = buildCsp({ dev: false, https: true, s3PublicBaseUrl: "https://bucket.s3.ap-south-1.amazonaws.com/uploads" });
    expect(directive(csp, "img-src")).toContain("https://bucket.s3.ap-south-1.amazonaws.com");
    expect(directive(csp, "connect-src")).not.toContain("https://bucket.s3.ap-south-1.amazonaws.com");
    expect(buildCsp({ dev: false, https: true, s3PublicBaseUrl: "not a url" })).not.toContain("not a url");
  });

  it("allows a plain-http S3/MinIO origin in img-src for local dev", () => {
    const csp = buildCsp({ dev: true, https: false, s3PublicBaseUrl: "http://localhost:9000/thrift-dev" });
    expect(directive(csp, "img-src")).toContain("http://localhost:9000");
  });

  it("sends the standard hardening headers and skips image routes", () => {
    const keys = securityHeaders({ dev: false, https: true }).map((h) => h.key);
    expect(keys).toEqual(["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy"]);
    expect(SECURITY_HEADER_SOURCE).toBe("/((?!api/uploads/|_next/image).*)");
    const re = /^\/((?!api\/uploads\/|_next\/image).*)$/;   // what Next's path-to-regexp compiles the source to
    expect(re.test("/products/alpha-tee")).toBe(true);
    expect(re.test("/api/uploads/products/a.png")).toBe(false);
    expect(re.test("/_next/image")).toBe(false);
  });
});

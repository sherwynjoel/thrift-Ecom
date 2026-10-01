import type { MetadataRoute } from "next";
import { absoluteUrl, siteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const live = process.env.NODE_ENV === "production" && !/localhost|127\.0\.0\.1/.test(siteUrl());
  if (!live) return { rules: { userAgent: "*", disallow: "/" }, sitemap: absoluteUrl("/sitemap.xml") };
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/uploads/"],
      disallow: ["/admin", "/account", "/checkout", "/cart", "/orders", "/invoice", "/search", "/api/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteUrl(),
  };
}

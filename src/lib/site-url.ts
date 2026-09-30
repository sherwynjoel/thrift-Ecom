/** The storefront's public origin, without a trailing slash (NEXT_PUBLIC_SITE_URL; localhost in development). */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Makes a site-relative URL ("/api/uploads/…") absolute for emails and other off-site use; absolute URLs pass through unchanged. */
export function absoluteUrl(url: string): string {
  return url.startsWith("/") && !url.startsWith("//") ? `${siteUrl()}${url}` : url;
}

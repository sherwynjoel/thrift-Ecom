import { z } from "zod";
import { isHttpUrl } from "@/lib/url";

/** Internal paths ("/collections/x?y=1#z") or absolute http(s) URLs. Never javascript:, data:, mailto: or protocol-relative "//host". */
export function isSafeHref(href: string): boolean {
  const s = href.trim();
  if (s.startsWith("/")) return !s.startsWith("//") && !s.startsWith("/\\") && !/[\s<>"'`]/.test(s);
  return isHttpUrl(s);
}

export function isExternalHref(href: string): boolean {
  return !href.trim().startsWith("/");
}

export const safeHrefSchema = z
  .string()
  .trim()
  .max(300, "Keep links under 300 characters")
  .refine(isSafeHref, "Use a path like /collections/new-drops or a full https:// link");

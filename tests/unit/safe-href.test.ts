import { describe, expect, it } from "vitest";
import { isExternalHref, isSafeHref, safeHrefSchema } from "@/lib/safe-href";

describe("safe links", () => {
  it("accepts internal paths and http(s) URLs", () => {
    for (const ok of ["/", "/collections/new-drops", "/products/a?color=Black#reviews", "https://instagram.com/brand", "http://example.com"]) {
      expect(isSafeHref(ok)).toBe(true);
    }
  });

  it("rejects scripts, protocol-relative and malformed links", () => {
    for (const bad of ["javascript:alert(1)", "//evil.test", "/\\evil.test", "data:text/html,hi", "mailto:a@b.c", "collections", "/a b", "https://"]) {
      expect(isSafeHref(bad)).toBe(false);
    }
  });

  it("classifies external links and trims in the schema", () => {
    expect(isExternalHref("/x")).toBe(false);
    expect(isExternalHref("https://x.test")).toBe(true);
    expect(safeHrefSchema.parse("  /collections/new-drops ")).toBe("/collections/new-drops");
    expect(safeHrefSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });
});

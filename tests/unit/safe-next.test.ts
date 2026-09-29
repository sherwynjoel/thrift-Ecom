import { describe, expect, it } from "vitest";
import { safeNext } from "@/server/safe-next";

const origin = "http://localhost:3000";

describe("safeNext", () => {
  it("keeps same-origin relative paths with query and hash", () => {
    expect(safeNext("/account?x=1#top", origin)).toBe("/account?x=1#top");
    expect(safeNext("/", origin)).toBe("/");
  });

  it("rejects cross-origin and scheme-relative forms", () => {
    expect(safeNext("https://evil.com", origin)).toBe("/");
    expect(safeNext("//evil.com", origin)).toBe("/");
    expect(new URL(safeNext("/\\evil.com", origin), origin).origin).toBe(origin);
    expect(safeNext("\\\\evil.com", origin)).toBe("/");
    expect(safeNext("javascript:alert(1)", origin)).toBe("/");
  });

  it("falls back to / for empty or garbage input", () => {
    expect(safeNext(null, origin)).toBe("/");
    expect(safeNext("", origin)).toBe("/");
    expect(safeNext("http://[", origin)).toBe("/");
  });
});

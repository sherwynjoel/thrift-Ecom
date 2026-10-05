import { describe, expect, it } from "vitest";
import { clampPage, MAX_PAGE } from "@/lib/pagination";

describe("clampPage", () => {
  it("turns any query value into a whole page between 1 and MAX_PAGE", () => {
    expect(clampPage("3")).toBe(3);
    expect(clampPage("1.9")).toBe(1);
    expect(clampPage("1e400")).toBe(1);
    expect(clampPage("1e9")).toBe(MAX_PAGE);
    expect(clampPage("-3")).toBe(1);
    expect(clampPage("abc")).toBe(1);
    expect(clampPage(undefined)).toBe(1);
  });
});

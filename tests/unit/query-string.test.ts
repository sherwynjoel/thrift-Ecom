import { describe, expect, it } from "vitest";
import { clearFilterParams, setParam, toggleListParam } from "@/lib/query-string";

describe("query-string", () => {
  it("toggles a value inside a comma list and resets paging", () => {
    let p = new URLSearchParams("size=S&page=3");
    p = toggleListParam(p, "size", "M");
    expect(p.get("size")).toBe("S,M");
    expect(p.has("page")).toBe(false);
    p = toggleListParam(p, "size", "S");
    expect(p.get("size")).toBe("M");
    p = toggleListParam(p, "size", "M");
    expect(p.has("size")).toBe(false);
  });

  it("sets or deletes a scalar and resets paging", () => {
    let p = new URLSearchParams("sort=newest&page=2");
    p = setParam(p, "minPrice", "50000");
    expect(p.get("minPrice")).toBe("50000");
    expect(p.has("page")).toBe(false);
    p = setParam(p, "minPrice", null);
    expect(p.has("minPrice")).toBe(false);
  });

  it("clears filters but keeps sort", () => {
    const p = clearFilterParams(new URLSearchParams("size=S&color=Black&sort=price-asc&page=4"));
    expect([...p.keys()]).toEqual(["sort"]);
  });
});

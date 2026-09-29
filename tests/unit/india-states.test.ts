import { describe, expect, it } from "vitest";
import { INDIA_STATES, isIndiaState } from "@/lib/india-states";

describe("INDIA_STATES", () => {
  it("lists 28 states and 8 union territories without duplicates", () => {
    expect(INDIA_STATES).toHaveLength(36);
    expect(new Set(INDIA_STATES).size).toBe(36);
    expect(INDIA_STATES).toContain("Tamil Nadu");
    expect(INDIA_STATES).toContain("Delhi");
    expect(INDIA_STATES).toContain("Dadra and Nagar Haveli and Daman and Diu");
  });

  it("checks membership exactly", () => {
    expect(isIndiaState("Karnataka")).toBe(true);
    expect(isIndiaState("karnataka")).toBe(false);
    expect(isIndiaState("Bombay")).toBe(false);
  });
});

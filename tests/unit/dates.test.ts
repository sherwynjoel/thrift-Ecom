import { describe, expect, it } from "vitest";
import { addDays, formatDateIst, formatDateTimeIst, formatTimeIst, istDateKey, startOfIstDay } from "@/lib/dates";

describe("IST formatting", () => {
  const d = new Date("2026-09-30T20:00:00Z"); // 1 Oct 2026, 01:30 IST
  it("formats in Asia/Kolkata regardless of server time zone", () => {
    expect(formatDateIst(d)).toBe("1 Oct 2026");
    expect(formatTimeIst(d)).toMatch(/^1:30\s?am$/i);
    expect(formatDateTimeIst(d)).toMatch(/^1 Oct 2026,? 1:30\s?am$/i);
  });
});

describe("IST day helpers", () => {
  it("finds the start of the IST day and its key", () => {
    expect(startOfIstDay(new Date("2026-09-30T20:00:00Z")).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(startOfIstDay(new Date("2026-10-01T18:29:59Z")).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(istDateKey(new Date("2026-09-30T20:00:00Z"))).toBe("2026-10-01");
    expect(addDays(new Date("2026-10-01T00:00:00Z"), -1).toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
});

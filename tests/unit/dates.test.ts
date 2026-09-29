import { describe, expect, it } from "vitest";
import { formatDateIst, formatDateTimeIst, formatTimeIst } from "@/lib/dates";

describe("IST formatting", () => {
  const d = new Date("2026-09-30T20:00:00Z"); // 1 Oct 2026, 01:30 IST
  it("formats in Asia/Kolkata regardless of server time zone", () => {
    expect(formatDateIst(d)).toBe("1 Oct 2026");
    expect(formatTimeIst(d)).toMatch(/^1:30\s?am$/i);
    expect(formatDateTimeIst(d)).toMatch(/^1 Oct 2026,? 1:30\s?am$/i);
  });
});

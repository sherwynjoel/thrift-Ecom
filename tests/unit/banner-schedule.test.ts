import { describe, expect, it } from "vitest";
import { bannerState } from "@/lib/banner-schedule";

const now = new Date("2026-10-10T10:00:00Z");
const at = (h: number) => new Date(now.getTime() + h * 3_600_000);

describe("bannerState", () => {
  it("is off when inactive regardless of dates", () => {
    expect(bannerState({ active: false, startsAt: null, endsAt: null }, now)).toBe("off");
  });
  it("respects the start and end window (end exclusive)", () => {
    expect(bannerState({ active: true, startsAt: null, endsAt: null }, now)).toBe("live");
    expect(bannerState({ active: true, startsAt: at(1), endsAt: null }, now)).toBe("scheduled");
    expect(bannerState({ active: true, startsAt: at(-1), endsAt: at(1) }, now)).toBe("live");
    expect(bannerState({ active: true, startsAt: null, endsAt: now }, now)).toBe("expired");
  });
});

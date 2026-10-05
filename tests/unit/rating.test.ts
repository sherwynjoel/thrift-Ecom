import { describe, expect, it } from "vitest";
import { autoApproves, formatRating, ratingLabel, reviewerName, roundRating } from "@/lib/rating";

describe("rating helpers", () => {
  it("rounds and formats averages", () => {
    expect(roundRating(4.349)).toBe(4.3);
    expect(roundRating(4.35)).toBe(4.4);
    expect(formatRating(5)).toBe("5.0");
    expect(ratingLabel(4.25)).toBe("4.3 out of 5 stars");
  });
  it("shortens reviewer names", () => {
    expect(reviewerName("Asha Rao")).toBe("Asha R.");
    expect(reviewerName("  ravi   kumar singh ")).toBe("ravi S.");
    expect(reviewerName("Asha")).toBe("Asha");
    expect(reviewerName(null)).toBe("Verified buyer");
    expect(reviewerName("   ")).toBe("Verified buyer");
  });
  it("auto-approves only 4 and 5 stars when enabled", () => {
    expect(autoApproves(5, true)).toBe(true);
    expect(autoApproves(4, true)).toBe(true);
    expect(autoApproves(3, true)).toBe(false);
    expect(autoApproves(5, false)).toBe(false);
  });
});

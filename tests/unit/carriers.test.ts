import { describe, expect, it } from "vitest";
import { CARRIERS, carrierById, trackingUrlFor } from "@/lib/carriers";

describe("carriers", () => {
  it("lists the spec's carriers with Other last", () => {
    expect(CARRIERS.map((c) => c.name)).toEqual(["Delhivery", "DTDC", "India Post", "Blue Dart", "Xpressbees", "Ekart", "Shadowfax", "Other"]);
    expect(carrierById("delhivery")?.name).toBe("Delhivery");
    expect(carrierById("nope")).toBeUndefined();
  });

  it("builds tracking URLs from templates, prefers a custom http(s) URL, and returns null otherwise", () => {
    expect(trackingUrlFor("delhivery", "AWB 12/3")).toBe("https://www.delhivery.com/track/package/AWB%2012%2F3");
    expect(trackingUrlFor("other", "X1")).toBeNull();
    expect(trackingUrlFor("other", "X1", "https://track.example.com/X1")).toBe("https://track.example.com/X1");
    expect(trackingUrlFor("delhivery", "X1", "javascript:alert(1)")).toBe("https://www.delhivery.com/track/package/X1");
  });
});

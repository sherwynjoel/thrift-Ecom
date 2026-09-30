import { describe, expect, it } from "vitest";
import { pngDimensions } from "@/lib/png";
import { fakePng } from "../helpers/png";

describe("pngDimensions", () => {
  it("reads width and height from the IHDR chunk", () => {
    expect(pngDimensions(fakePng(3600, 4800))).toEqual({ width: 3600, height: 4800 });
    expect(pngDimensions(fakePng(800, 1000))).toEqual({ width: 800, height: 1000 });
  });

  it("rejects non-PNG bytes, short input and a missing IHDR", () => {
    expect(pngDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(pngDimensions(fakePng(10, 10).slice(0, 20))).toBeNull();
    const broken = fakePng(10, 10);
    broken[12] = 0x58;
    expect(pngDimensions(broken)).toBeNull();
  });

  it("works on a subarray view", () => {
    const outer = new Uint8Array(64);
    outer.set(fakePng(12, 34), 8);
    expect(pngDimensions(outer.subarray(8))).toEqual({ width: 12, height: 34 });
  });
});

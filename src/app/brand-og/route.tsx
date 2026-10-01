import { ImageResponse } from "next/og";
import { BRAND } from "@/config/brand";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 72, background: "#0A0A0A", color: "#F5F5F0" }}>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -2, textTransform: "uppercase", lineHeight: 0.9 }}>{BRAND.name}</div>
        <div style={{ marginTop: 24, fontSize: 44, color: "#D4FF3F" }}>{BRAND.tagline}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

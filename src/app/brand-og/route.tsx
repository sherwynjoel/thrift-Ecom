import { ImageResponse } from "next/og";
import { BRAND } from "@/config/brand";
import { BRAND_BLACK, BRAND_INK, BRAND_LIME, wordmarkSvg } from "@/lib/logo";

export const dynamic = "force-static";

export function GET() {
  const logo = `data:image/svg+xml;utf8,${encodeURIComponent(wordmarkSvg(160))}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 72, background: BRAND_BLACK, color: BRAND_INK }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={458} height={160} alt={BRAND.name} />
        <div style={{ marginTop: 32, fontSize: 44, color: BRAND_LIME }}>{BRAND.tagline}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

import { ImageResponse } from "next/og";
import { iconSvg } from "@/lib/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon: the tebox "t" mark, rendered from the same geometry as /icon.svg. */
export default function AppleIcon() {
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(iconSvg(180))}`;
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={180} height={180} alt="" />,
    size,
  );
}

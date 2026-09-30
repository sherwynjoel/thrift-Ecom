import { Anton, Inter, Permanent_Marker } from "next/font/google";
import { displayFont } from "@/app/fonts";
import type { StudioFontId } from "@/lib/studio/constants";

const anton = Anton({ weight: "400", subsets: ["latin"], display: "swap" });
const inter = Inter({ weight: ["400", "700"], style: ["normal", "italic"], subsets: ["latin"], display: "swap" });
const marker = Permanent_Marker({ weight: "400", subsets: ["latin"], display: "swap" });

/** Build-specific family strings; canvas text stores the stable StudioFontId and is remapped on load (withFontFamilies). */
export const STUDIO_FONT_FAMILIES: Record<StudioFontId, string> = {
  anton: anton.style.fontFamily,
  bebas: displayFont.style.fontFamily,
  inter: inter.style.fontFamily,
  marker: marker.style.fontFamily,
};

export const STUDIO_FONT_CLASSNAMES = [anton.className, inter.className, marker.className].join(" ");

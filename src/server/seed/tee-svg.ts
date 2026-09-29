function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (n & 255) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** A flat 4:5 T-shirt mockup. Back side carries a print block so hover-swap is visible. */
export function teeSvg(hex: string, side: "front" | "back"): string {
  const dark = shade(hex, -28);
  const print = side === "back"
    ? `<rect x="300" y="330" width="200" height="240" rx="6" fill="${shade(hex, 70)}" opacity="0.9"/>
       <text x="400" y="470" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="46" font-weight="900" fill="${dark}">BACK</text>`
    : `<rect x="340" y="360" width="120" height="60" rx="4" fill="${shade(hex, 70)}" opacity="0.85"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">
  <rect width="800" height="1000" fill="#141414"/>
  <path d="M250 180 L330 140 Q400 200 470 140 L550 180 L680 260 L620 360 L560 320 L560 880 L240 880 L240 320 L180 360 L120 260 Z" fill="${hex}" stroke="${dark}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M330 140 Q400 230 470 140" fill="none" stroke="${dark}" stroke-width="6"/>
  ${print}
</svg>`;
}

import type { Fit } from "@prisma/client";

export interface SeedColor { name: string; hex: string }
export interface SeedProduct {
  name: string;
  fit: Fit;
  pricePaise: number;
  compareAtPaise: number | null;
  colors: SeedColor[];
  sizes: string[];
  collections: string[]; // collection slugs
  description: string;
  isCustomizable?: boolean;
  lowStock?: boolean;
}

export const SEED_COLLECTIONS = [
  { slug: "new-drops", name: "New Drops", isFeatured: true, sortOrder: 0, description: "Fresh off the press. New designs every week." },
  { slug: "oversized-tees", name: "Oversized Tees", isFeatured: true, sortOrder: 1, description: "Dropped shoulders, heavy cotton, room to move." },
  { slug: "graphic-tees", name: "Graphic Tees", isFeatured: true, sortOrder: 2, description: "Loud prints for loud people." },
  { slug: "regular-fit-tees", name: "Regular Fit", isFeatured: false, sortOrder: 3, description: "Classic cut, everyday weight." },
  { slug: "plain-tees", name: "Plain & Blank", isFeatured: false, sortOrder: 4, description: "Solid colors. Print your own or wear them clean." },
];

const BLACK = { name: "Black", hex: "#111111" };
const WHITE = { name: "White", hex: "#f2f2ee" };
const BEIGE = { name: "Beige", hex: "#d9c7a5" };
const LIME = { name: "Lime", hex: "#c6ff3d" };
const NAVY = { name: "Navy", hex: "#1c2a4a" };
const RED = { name: "Red", hex: "#b3261e" };
const OLIVE = { name: "Olive", hex: "#5b6b3a" };
const LILAC = { name: "Lilac", hex: "#b8a3e6" };

const ALL = ["S", "M", "L", "XL", "XXL"];
const OVERSIZED_DESC = "Heavyweight 240 GSM cotton with a drop-shoulder cut. Pre-shrunk, bio-washed, and printed to last.";
const REGULAR_DESC = "180 GSM combed cotton in a classic straight cut. Soft hand feel, holds its shape wash after wash.";

export const SEED_PRODUCTS: SeedProduct[] = [
  { name: "Static Noise Oversized Tee", fit: "OVERSIZED", pricePaise: 69900, compareAtPaise: 129900, colors: [BLACK, WHITE], sizes: ALL, collections: ["new-drops", "oversized-tees", "graphic-tees"], description: OVERSIZED_DESC },
  { name: "Acid Wash Skull Oversized Tee", fit: "OVERSIZED", pricePaise: 79900, compareAtPaise: 149900, colors: [BLACK], sizes: ALL, collections: ["new-drops", "oversized-tees", "graphic-tees"], description: OVERSIZED_DESC, lowStock: true },
  { name: "Neon Ticker Oversized Tee", fit: "OVERSIZED", pricePaise: 64900, compareAtPaise: 119900, colors: [BLACK, LIME], sizes: ALL, collections: ["new-drops", "oversized-tees"], description: OVERSIZED_DESC },
  { name: "Late Nights Back Print Tee", fit: "OVERSIZED", pricePaise: 74900, compareAtPaise: 139900, colors: [BLACK, NAVY], sizes: ALL, collections: ["oversized-tees", "graphic-tees"], description: OVERSIZED_DESC },
  { name: "Concrete Garden Oversized Tee", fit: "OVERSIZED", pricePaise: 69900, compareAtPaise: null, colors: [BEIGE, OLIVE], sizes: ALL, collections: ["oversized-tees", "graphic-tees"], description: OVERSIZED_DESC },
  { name: "Signal Lost Oversized Tee", fit: "OVERSIZED", pricePaise: 59900, compareAtPaise: 109900, colors: [WHITE, LILAC], sizes: ALL, collections: ["oversized-tees", "graphic-tees"], description: OVERSIZED_DESC },
  { name: "Heavy Rotation Oversized Tee", fit: "OVERSIZED", pricePaise: 84900, compareAtPaise: 159900, colors: [BLACK, RED], sizes: ALL, collections: ["new-drops", "oversized-tees"], description: OVERSIZED_DESC },
  { name: "Blank Oversized Tee", fit: "OVERSIZED", pricePaise: 54900, compareAtPaise: 89900, colors: [BLACK, WHITE, BEIGE, NAVY, LIME], sizes: ALL, collections: ["plain-tees", "oversized-tees"], description: "Our blank canvas. Heavyweight, boxy, and ready for your print.", isCustomizable: true },
  { name: "Blank Regular Tee", fit: "REGULAR", pricePaise: 44900, compareAtPaise: 69900, colors: [BLACK, WHITE, RED, OLIVE], sizes: ALL, collections: ["plain-tees", "regular-fit-tees"], description: "Classic blank. Light, soft, and print-ready.", isCustomizable: true },
  { name: "Minimal Logo Regular Tee", fit: "REGULAR", pricePaise: 49900, compareAtPaise: 89900, colors: [BLACK, WHITE], sizes: ALL, collections: ["regular-fit-tees"], description: REGULAR_DESC },
  { name: "Retro Stripe Regular Tee", fit: "REGULAR", pricePaise: 54900, compareAtPaise: 99900, colors: [BEIGE, NAVY], sizes: ALL, collections: ["regular-fit-tees", "graphic-tees"], description: REGULAR_DESC },
  { name: "Sunset District Regular Tee", fit: "REGULAR", pricePaise: 52900, compareAtPaise: 94900, colors: [WHITE, LILAC], sizes: ALL, collections: ["regular-fit-tees", "graphic-tees"], description: REGULAR_DESC, lowStock: true },
  { name: "Boxy Pocket Relaxed Tee", fit: "RELAXED", pricePaise: 62900, compareAtPaise: 109900, colors: [OLIVE, BEIGE], sizes: ALL, collections: ["new-drops"], description: "Relaxed shoulder with a chest pocket. Midweight cotton, garment dyed.", },
  { name: "Night Shift Relaxed Tee", fit: "RELAXED", pricePaise: 64900, compareAtPaise: 119900, colors: [BLACK, NAVY], sizes: ALL, collections: ["new-drops", "graphic-tees"], description: "Relaxed cut with a tonal chest print. Midweight cotton, garment dyed." },
  { name: "Plain Oversized Tee", fit: "OVERSIZED", pricePaise: 49900, compareAtPaise: 79900, colors: [BLACK, WHITE, LILAC], sizes: ALL, collections: ["plain-tees", "oversized-tees"], description: "Solid oversized tee with no print. Heavyweight cotton." },
  { name: "Plain Regular Tee", fit: "REGULAR", pricePaise: 39900, compareAtPaise: 59900, colors: [BLACK, WHITE, RED], sizes: ALL, collections: ["plain-tees", "regular-fit-tees"], description: "Solid regular tee with no print. Light combed cotton." },
];

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatPaise(paise: number): string {
  return inr.format(Math.round(paise / 100)).replace(/[\s  ]/g, "");
}

export function discountPercent(pricePaise: number, compareAtPaise: number | null | undefined): number | null {
  if (!compareAtPaise || compareAtPaise <= pricePaise) return null;
  return Math.round(((compareAtPaise - pricePaise) / compareAtPaise) * 100);
}

export function rupeesToPaise(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function paiseToRupees(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "";
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, "0")}`;
}

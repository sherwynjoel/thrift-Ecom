import { z } from "zod";

/** Form helper: undefined, null, "" and whitespace-only strings become null. */
export function blankToNull(v: unknown): unknown {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v;
}

/** Optional free text: blank, whitespace-only, null or undefined all become null. */
export function optionalText(max: number) {
  return z.preprocess(
    (v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v),
    z.string().trim().max(max, `Keep this under ${max} characters`).nullable(),
  );
}

export function normalizeIndianPhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

export const phoneSchema = z
  .string()
  .transform(normalizeIndianPhone)
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"));

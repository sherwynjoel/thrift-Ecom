import { rupeesToPaise } from "@/lib/money";

/**
 * Small parsers for admin form text fields. Each returns the value the server schema expects, or
 * `undefined` when the text is not a valid entry (so the form can show a field error instead of
 * sending NaN). Blank optional fields become null.
 */

export function parseRupeesField(text: string, { optional }: { optional: boolean }): number | null | undefined {
  if (!text.trim()) return optional ? null : undefined;
  return rupeesToPaise(text) ?? undefined;
}

export function parseIntField(text: string, { optional }: { optional: boolean }): number | null | undefined {
  const t = text.trim();
  if (!t) return optional ? null : undefined;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** A Date as the `YYYY-MM-DDTHH:mm` value of an `<input type="datetime-local">`, in the browser's own time zone. */
export function toDateTimeLocal(d: Date | null): string {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The datetime-local value as an ISO instant (the browser applies its own zone), or null when blank; undefined if unparseable. */
export function fromDateTimeLocal(value: string): string | null | undefined {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

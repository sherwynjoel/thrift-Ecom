export const IST_TIME_ZONE = "Asia/Kolkata";

const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true });

export function formatDateIst(d: Date): string {
  return dateFmt.format(d);
}

export function formatTimeIst(d: Date): string {
  return timeFmt.format(d).toLowerCase();
}

export function formatDateTimeIst(d: Date): string {
  return `${formatDateIst(d)}, ${formatTimeIst(d)}`;
}

export const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;

/** The UTC instant of 00:00 IST on the IST calendar date that `d` falls on. */
export function startOfIstDay(d: Date): Date {
  const shifted = d.getTime() + IST_OFFSET_MS;
  const intoDay = ((shifted % DAY_MS) + DAY_MS) % DAY_MS;
  return new Date(shifted - intoDay - IST_OFFSET_MS);
}

/** "YYYY-MM-DD" of the IST calendar date that `d` falls on. */
export function istDateKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

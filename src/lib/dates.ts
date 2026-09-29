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

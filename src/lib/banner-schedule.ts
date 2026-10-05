export type BannerState = "live" | "scheduled" | "expired" | "off";

export const BANNER_STATE_LABEL: Record<BannerState, string> = { live: "Live", scheduled: "Scheduled", expired: "Ended", off: "Off" };

export function bannerState(b: { active: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date = new Date()): BannerState {
  if (!b.active) return "off";
  if (b.startsAt && b.startsAt > now) return "scheduled";
  if (b.endsAt && b.endsAt <= now) return "expired";
  return "live";
}

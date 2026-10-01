export function roundRating(avg: number): number {
  return Math.round(avg * 10 + Number.EPSILON) / 10;
}

export function formatRating(avg: number): string {
  return roundRating(avg).toFixed(1);
}

export function ratingLabel(avg: number): string {
  return `${formatRating(avg)} out of 5 stars`;
}

/** "Asha Rao" → "Asha R."; a single name stays as is; blank → "Verified buyer". */
export function reviewerName(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Verified buyer";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function autoApproves(rating: number, autoApprove: boolean): boolean {
  return autoApprove && rating >= 4;
}

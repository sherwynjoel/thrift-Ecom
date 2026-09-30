export interface Pt { x: number; y: number }

/** Scale and rotation that take the two-finger segment a0→b0 to a1→b1. */
export function pinchTransform(a0: Pt, b0: Pt, a1: Pt, b1: Pt): { scale: number; rotateDeg: number } {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const ang0 = Math.atan2(b0.y - a0.y, b0.x - a0.x);
  const ang1 = Math.atan2(b1.y - a1.y, b1.x - a1.x);
  return { scale: d0 > 0 ? d1 / d0 : 1, rotateDeg: ((ang1 - ang0) * 180) / Math.PI };
}

export function clampScale(s: number, min = 0.05, max = 20): number {
  return Math.min(max, Math.max(min, s));
}

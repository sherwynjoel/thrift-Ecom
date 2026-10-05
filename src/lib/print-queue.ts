export interface PrintGroupable { colorName: string; size: string; quantity: number }
export interface PrintGroup<T> { key: string; colorName: string; size: string; units: number; items: T[] }

/** Groups queue items by blank ("Black / M") so one stack of tees can be printed in a run; groups keep first-seen (oldest) order. */
export function groupPrintQueue<T extends PrintGroupable>(items: T[]): PrintGroup<T>[] {
  const groups = new Map<string, PrintGroup<T>>();
  for (const it of items) {
    const key = `${it.colorName} / ${it.size}`;
    const g = groups.get(key) ?? { key, colorName: it.colorName, size: it.size, units: 0, items: [] };
    g.units += it.quantity;
    g.items.push(it);
    groups.set(key, g);
  }
  return [...groups.values()];
}

const HOUR = 3_600_000;

export function ageLabel(paidAt: Date | null, now: Date): string {
  if (!paidAt) return "—";
  const ms = now.getTime() - paidAt.getTime();
  if (ms < HOUR) return "<1h";
  if (ms < 24 * HOUR) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / (24 * HOUR))}d`;
}

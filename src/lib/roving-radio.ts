import type { KeyboardEvent } from "react";

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
const EDGE: Record<string, number> = { Home: 0, End: -1 };

/**
 * Pure index math for the radiogroup keyboard pattern: arrow keys move `at` by one, wrapping;
 * Home/End jump to the first/last index. Returns null for any other key or an empty group.
 */
export function nextRadioIndex(key: string, length: number, at: number): number | null {
  if (!length) return null;
  const edge = EDGE[key];
  if (edge !== undefined) return edge < 0 ? length + edge : edge;
  const step = STEP[key];
  if (!step) return null;
  return (at + step + length) % length;
}

/**
 * Keyboard handler for a role="radiogroup" of role="radio" buttons (WAI-ARIA radio group pattern):
 * arrow keys move to the next/previous enabled radio (wrapping), Home/End jump to the first/last
 * enabled radio, and the destination is selected. Pair with radioTabIndex so the group is a single Tab stop.
 */
export function onRadioGroupKeyDown(e: KeyboardEvent<HTMLElement>) {
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'));
  const at = radios.indexOf(document.activeElement as HTMLElement);
  const nextIndex = nextRadioIndex(e.key, radios.length, at);
  if (nextIndex === null) return;
  e.preventDefault();
  const next = radios[nextIndex];
  next.focus();
  next.click();
}

/** Roving tabindex: the checked radio is the Tab stop, or the first enabled one when none is checked. */
export function radioTabIndex<T>(items: readonly T[], index: number, isChecked: (item: T) => boolean, isDisabled: (item: T) => boolean = () => false): 0 | -1 {
  const checked = items.findIndex((i) => isChecked(i) && !isDisabled(i));
  const stop = checked >= 0 ? checked : items.findIndex((i) => !isDisabled(i));
  return index === stop ? 0 : -1;
}

import type { KeyboardEvent } from "react";

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Keyboard handler for a role="radiogroup" of role="radio" buttons (WAI-ARIA radio group pattern):
 * arrow keys move to the next/previous enabled radio, wrapping, and select it.
 * Pair with radioTabIndex so the group is a single Tab stop.
 */
export function onRadioGroupKeyDown(e: KeyboardEvent<HTMLElement>) {
  const step = STEP[e.key];
  if (!step) return;
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'));
  if (!radios.length) return;
  e.preventDefault();
  const at = radios.indexOf(document.activeElement as HTMLElement);
  const next = radios[(at + step + radios.length) % radios.length];
  next.focus();
  next.click();
}

/** Roving tabindex: the checked radio is the Tab stop, or the first enabled one when none is checked. */
export function radioTabIndex<T>(items: readonly T[], index: number, isChecked: (item: T) => boolean, isDisabled: (item: T) => boolean = () => false): 0 | -1 {
  const checked = items.findIndex((i) => isChecked(i) && !isDisabled(i));
  const stop = checked >= 0 ? checked : items.findIndex((i) => !isDisabled(i));
  return index === stop ? 0 : -1;
}

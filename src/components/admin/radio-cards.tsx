"use client";

import { cn } from "@/lib/utils";

/** A labelled group of native radios drawn as tappable cards (44px min height). */
export function RadioCards<T extends string>({ legend, name, value, options, onChange }: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
              value === o.value ? "border-brand bg-brand/10" : "border-border hover:bg-surface-raised",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="size-4 accent-brand" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

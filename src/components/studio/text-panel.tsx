"use client";

import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_TEXT_CHARS, STUDIO_FONTS, isStudioFontId, type StudioFontId } from "@/lib/studio/constants";
import { cn } from "@/lib/utils";
import { STUDIO_FONT_FAMILIES } from "./fonts";
import type { SelectedText } from "./use-studio-canvas";

const SWATCHES = [
  { hex: "#111111", label: "Black" },
  { hex: "#ffffff", label: "White" },
  { hex: "#ff4d4d", label: "Red" },
  { hex: "#ffd60a", label: "Yellow" },
  { hex: "#1d3557", label: "Navy" },
  { hex: "#2a9d8f", label: "Green" },
] as const;

const ALIGN_OPTIONS = [
  { id: "left", label: "Align left", Icon: AlignLeft },
  { id: "center", label: "Align centre", Icon: AlignCenter },
  { id: "right", label: "Align right", Icon: AlignRight },
] as const;

const selectClass = "h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const toggleClass = (on: boolean) =>
  cn(
    "inline-flex size-11 items-center justify-center rounded-md border motion-safe:transition-colors",
    on ? "border-brand bg-brand text-brand-ink" : "border-border bg-surface text-text hover:border-text-muted",
  );

function FontSelect({ id, value, onChange }: { id: string; value: StudioFontId; onChange(v: StudioFontId): void }) {
  return (
    <select id={id} className={selectClass} value={value} onChange={(e) => isStudioFontId(e.target.value) && onChange(e.target.value)}>
      {STUDIO_FONTS.map((f) => (
        <option key={f.id} value={f.id} style={{ fontFamily: STUDIO_FONT_FAMILIES[f.id] }}>{f.label}</option>
      ))}
    </select>
  );
}

export function TextPanel({ selected, onAdd, onChange }: {
  selected: SelectedText | null;
  onAdd(text: string, fontId: StudioFontId): Promise<void>;
  onChange(patch: Partial<SelectedText>): Promise<void>;
}) {
  const [text, setText] = useState("");
  const [fontId, setFontId] = useState<StudioFontId>("anton");

  return (
    <div className="space-y-6" data-testid="text-panel">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await onAdd(text, fontId);
          setText("");
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="studio-text">Text</Label>
          <Input id="studio-text" data-testid="text-input" className="h-11" maxLength={MAX_TEXT_CHARS} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your words here" autoComplete="off" enterKeyHint="done" />
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="studio-font">Font</Label>
            <FontSelect id="studio-font" value={fontId} onChange={setFontId} />
          </div>
          <Button type="submit" className="h-11 px-4 font-display text-lg tracking-wide" data-testid="add-text" disabled={!text.trim()}>
            <Plus aria-hidden className="size-4" />
            Add text
          </Button>
        </div>
      </form>

      {selected ? (
        <div className="space-y-5 border-t border-border pt-5" data-testid="text-editor">
          <p className="text-xs uppercase tracking-[0.2em] text-brand">Selected text</p>
          <div className="space-y-2">
            <Label htmlFor="studio-edit-text">Edit selected text</Label>
            <textarea
              id="studio-edit-text"
              rows={2}
              maxLength={MAX_TEXT_CHARS}
              value={selected.text}
              onChange={(e) => void onChange({ text: e.target.value })}
              className="min-h-11 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
              data-testid="text-edit"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="studio-edit-font">Font</Label>
            <FontSelect id="studio-edit-font" value={selected.fontId} onChange={(v) => void onChange({ fontId: v })} />
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Colour</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {SWATCHES.map((s) => {
                const on = selected.fill === s.hex;
                return (
                  <button
                    key={s.hex}
                    type="button"
                    aria-label={s.label}
                    aria-pressed={on}
                    title={s.label}
                    onClick={() => void onChange({ fill: s.hex })}
                    className={cn("size-11 rounded-full border-2", on ? "border-brand shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--accent)]" : "border-border")}
                    style={{ backgroundColor: s.hex }}
                  />
                );
              })}
              <label className="relative inline-flex size-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-border bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" title="Custom colour">
                <span className="sr-only">Custom colour</span>
                <input type="color" className="absolute inset-0 size-11 cursor-pointer opacity-0" value={selected.fill} onChange={(e) => void onChange({ fill: e.target.value })} data-testid="text-color" />
              </label>
            </div>
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="studio-size">Size</Label>
              <span className="text-xs tabular-nums text-text-muted">{Math.round(selected.fontSize)}</span>
            </div>
            <input id="studio-size" type="range" min={12} max={160} step={1} value={Math.round(selected.fontSize)} onChange={(e) => void onChange({ fontSize: Number(e.target.value) })} className="h-11 w-full accent-[var(--accent)]" />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-2" role="group" aria-label="Style">
              <button type="button" aria-label="Bold" aria-pressed={selected.bold} onClick={() => void onChange({ bold: !selected.bold })} className={toggleClass(selected.bold)}>
                <Bold aria-hidden className="size-4" />
              </button>
              <button type="button" aria-label="Italic" aria-pressed={selected.italic} onClick={() => void onChange({ italic: !selected.italic })} className={toggleClass(selected.italic)}>
                <Italic aria-hidden className="size-4" />
              </button>
            </div>
            <div className="flex gap-2" role="radiogroup" aria-label="Alignment">
              {ALIGN_OPTIONS.map(({ id, label, Icon }) => (
                <button key={id} type="button" role="radio" aria-label={label} aria-checked={selected.align === id} onClick={() => void onChange({ align: id })} className={toggleClass(selected.align === id)}>
                  <Icon aria-hidden className="size-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="studio-spacing">Letter spacing</Label>
              <span className="text-xs tabular-nums text-text-muted">{selected.charSpacing}</span>
            </div>
            <input id="studio-spacing" type="range" min={-100} max={800} step={10} value={selected.charSpacing} onChange={(e) => void onChange({ charSpacing: Number(e.target.value) })} className="h-11 w-full accent-[var(--accent)]" />
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs leading-relaxed text-text-muted">
          Tap a text layer on the shirt to change its font, colour, size and spacing.
        </p>
      )}
    </div>
  );
}

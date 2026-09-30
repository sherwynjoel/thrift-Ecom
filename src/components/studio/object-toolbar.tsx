"use client";

import { ArrowDown, ArrowUp, Copy, Crosshair, Redo2, Trash2, Undo2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DpiChip } from "./dpi-chip";
import type { StudioCanvasApi } from "./use-studio-canvas";

function Tool({ label, Icon, onClick, disabled, danger }: { label: string; Icon: LucideIcon; onClick(): void; disabled: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-md motion-safe:transition-colors disabled:pointer-events-none disabled:opacity-30",
        danger ? "text-danger hover:bg-danger/10" : "text-text hover:bg-surface-raised",
      )}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}

function HistoryTools({ api }: { api: StudioCanvasApi }) {
  return (
    <>
      <Tool label="Undo" Icon={Undo2} onClick={() => void api.undo()} disabled={!api.canUndo} />
      <Tool label="Redo" Icon={Redo2} onClick={() => void api.redo()} disabled={!api.canRedo} />
    </>
  );
}

function LayerTools({ api }: { api: StudioCanvasApi }) {
  const none = !api.ready || api.selectedKind === null;
  return (
    <>
      <Tool label="Duplicate" Icon={Copy} onClick={() => void api.duplicateSelected()} disabled={none} />
      <Tool label="Bring forward" Icon={ArrowUp} onClick={api.forward} disabled={none} />
      <Tool label="Send backward" Icon={ArrowDown} onClick={api.backward} disabled={none} />
      <Tool label="Centre" Icon={Crosshair} onClick={api.centerSelected} disabled={none} />
      <Tool label="Delete" Icon={Trash2} onClick={api.removeSelected} disabled={none} danger />
    </>
  );
}

/** The edit toolbar under the stage (desktop, and mobile while the tool sheet is closed). */
export function ObjectToolbar({ api, className }: { api: StudioCanvasApi; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div role="toolbar" aria-label="Edit" className="flex flex-wrap items-center justify-center gap-0.5 sm:gap-1" data-testid="object-toolbar">
        <HistoryTools api={api} />
        <span aria-hidden className="mx-1 h-6 w-px bg-border" />
        <LayerTools api={api} />
      </div>
      <DpiChip dpi={api.selectedDpi} />
    </div>
  );
}

/**
 * Mobile with the tool sheet open: the same tools as two slim columns either side of the shrunken stage,
 * so the shirt keeps as much of the space above the sheet as possible.
 */
export function ObjectToolColumns({ api, side, className }: { api: StudioCanvasApi; side: "left" | "right"; className?: string }) {
  return (
    <div role="toolbar" aria-orientation="vertical" aria-label={side === "left" ? "Edit" : "Arrange"} className={cn("flex flex-col items-center gap-0.5", className)}>
      {side === "left" ? (
        <>
          <HistoryTools api={api} />
        </>
      ) : (
        <>
          <Tool label="Duplicate" Icon={Copy} onClick={() => void api.duplicateSelected()} disabled={!api.ready || api.selectedKind === null} />
          <Tool label="Bring forward" Icon={ArrowUp} onClick={api.forward} disabled={!api.ready || api.selectedKind === null} />
          <Tool label="Send backward" Icon={ArrowDown} onClick={api.backward} disabled={!api.ready || api.selectedKind === null} />
          <Tool label="Centre" Icon={Crosshair} onClick={api.centerSelected} disabled={!api.ready || api.selectedKind === null} />
          <Tool label="Delete" Icon={Trash2} onClick={api.removeSelected} disabled={!api.ready || api.selectedKind === null} danger />
        </>
      )}
    </div>
  );
}

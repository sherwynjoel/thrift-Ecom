import { shirtSvgMarkup } from "@/lib/studio/shirt";
import type { DesignSide } from "@/lib/studio/constants";
import { cn } from "@/lib/utils";

/** Pure SVG tee filled with the variant hex. shirtSvgMarkup only interpolates numbers and a validated hex. */
export function ShirtSvg({ hex, side, guide = true, className }: { hex: string; side: DesignSide; guide?: boolean; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`${side === "front" ? "Front" : "Back"} of the tee`}
      className={cn("[&>svg]:h-full [&>svg]:w-full", className)}
      dangerouslySetInnerHTML={{ __html: shirtSvgMarkup(hex, side, { guide }) }}
      data-testid="shirt-svg"
    />
  );
}

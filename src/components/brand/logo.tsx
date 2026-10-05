import { BRAND } from "@/config/brand";
import { LOGO_BOX_PATH, LOGO_INK_PATH, LOGO_VIEWBOX } from "@/lib/logo";
import { cn } from "@/lib/utils";

/** The tbox wordmark. Letters follow `currentColor`; the box "o" is always the brand lime. Size it with height classes (e.g. `h-7`). */
export function Logo({ className, title = BRAND.name }: { className?: string; title?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} role="img" aria-label={title} className={cn("block w-auto shrink-0", className)}>
      <path d={LOGO_INK_PATH} fill="currentColor" />
      <path d={LOGO_BOX_PATH} fill="var(--accent)" fillRule="evenodd" />
    </svg>
  );
}

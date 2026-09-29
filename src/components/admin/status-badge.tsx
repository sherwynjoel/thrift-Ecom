import type { ProductStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const STYLES: Record<ProductStatus, string> = {
  ACTIVE: "bg-brand text-brand-ink",
  DRAFT: "bg-surface-raised text-text",
  ARCHIVED: "bg-surface text-text-muted border border-border",
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide", STYLES[status])} data-testid="status-badge">{status.toLowerCase()}</span>;
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Gift, LayoutDashboard, Layers, Package, Settings, ShoppingBag, Store, Ticket, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/collections", label: "Collections", icon: Layers },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket },
  { href: "/admin/offers", label: "Offers", icon: Gift },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminNav({ toShipCount }: { toShipCount: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto whitespace-nowrap pb-1 lg:flex-col lg:overflow-visible lg:whitespace-normal lg:pb-0" aria-label="Admin">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm", active ? "bg-surface-raised text-text" : "text-text-muted hover:bg-surface hover:text-text")}>
            <Icon className="size-4" />
            {label}
            {href === "/admin/orders" && toShipCount > 0 && (
              <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-brand-ink" data-testid="to-ship-badge">
                <span className="sr-only">To ship: </span>
                {toShipCount}
              </span>
            )}
          </Link>
        );
      })}
      <Link href="/" className="mt-auto flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-text-muted hover:text-text lg:mt-6">
        <Store className="size-4" /> View store
      </Link>
    </nav>
  );
}

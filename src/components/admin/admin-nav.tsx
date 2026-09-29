"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Layers, Store } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/collections", label: "Collections", icon: Layers },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto whitespace-nowrap lg:flex-col lg:overflow-x-visible lg:whitespace-normal" aria-label="Admin">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm", active ? "bg-surface-raised text-text" : "text-text-muted hover:bg-surface hover:text-text")}>
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
      <Link href="/" className="mt-auto flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-text-muted hover:text-text lg:mt-6">
        <Store className="size-4" /> View store
      </Link>
    </nav>
  );
}

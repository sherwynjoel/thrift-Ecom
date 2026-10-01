import Link from "next/link";
import { Search, User } from "lucide-react";
import { BRAND } from "@/config/brand";
import { SITE_NAV } from "@/config/site";
import { CartTrigger } from "./cart-trigger";
import { MobileNav } from "./mobile-nav";

export function Header({ cartCount, isLoggedIn }: { cartCount: number; isLoggedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur" data-testid="site-header">
      <div className="container-x flex h-16 items-center gap-1 sm:gap-4">
        <MobileNav />
        <Link href="/" className="inline-flex h-11 items-center font-display text-3xl uppercase tracking-tight" aria-label={`${BRAND.name} home`}>{BRAND.name}</Link>
        <nav className="ml-8 hidden items-center gap-6 lg:flex">
          {SITE_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm uppercase tracking-wide text-text-muted transition-colors hover:text-text">{item.label}</Link>
          ))}
        </nav>
        <form action="/search" className="ml-auto hidden items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 md:flex" role="search">
          <Search className="size-4 text-text-muted" />
          <input name="q" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" placeholder="Search tees" className="w-40 bg-transparent text-sm outline-none placeholder:text-text-muted" aria-label="Search products" />
        </form>
        <Link href="/search" className="ml-auto inline-flex size-11 items-center justify-center md:hidden" aria-label="Search"><Search className="size-5" /></Link>
        <Link href={isLoggedIn ? "/account" : "/login"} className="inline-flex size-11 items-center justify-center" aria-label={isLoggedIn ? "Account" : "Log in"} data-testid="account-link"><User className="size-5" /></Link>
        <CartTrigger count={cartCount} />
      </div>
    </header>
  );
}

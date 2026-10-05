import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/config/brand";
import { FOOTER_LINKS } from "@/config/site";
import { NewsletterForm } from "./newsletter-form";

const GROUPS: { title: string; links: readonly { label: string; href: string }[] }[] = [
  { title: "Shop", links: FOOTER_LINKS.shop },
  { title: "Help", links: FOOTER_LINKS.help },
  { title: "Company", links: FOOTER_LINKS.company },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-surface" data-testid="site-footer">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo className="h-10" />
          <p className="max-w-xs text-sm text-text-muted">{BRAND.tagline}</p>
          <NewsletterForm />
          <div className="flex gap-6 text-sm text-text-muted">
            <a href={BRAND.social.instagram} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center hover:text-text">Instagram</a>
            <a href={BRAND.social.youtube} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center hover:text-text">YouTube</a>
          </div>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-2 font-display text-xl uppercase lg:mb-4">{g.title}</p>
            <ul className="text-sm text-text-muted lg:space-y-2">
              {g.links.map((l) => (
                <li key={l.href}><Link href={l.href} className="inline-flex min-h-11 min-w-11 items-center hover:text-text lg:min-h-0">{l.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center justify-center gap-1 border-t border-border py-6 text-center text-xs text-text-muted sm:flex-row sm:gap-3">
        <span>© {new Date().getFullYear()} {BRAND.name}. Made in India.</span>
        <span className="hidden sm:inline" aria-hidden="true">·</span>
        <a href={BRAND.poweredBy.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center hover:text-text" data-testid="powered-by">
          Powered by <span className="font-semibold text-brand">{BRAND.poweredBy.name}</span>
        </a>
      </div>
    </footer>
  );
}

import Link from "next/link";
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
          <p className="font-display text-4xl uppercase tracking-tight">{BRAND.name}</p>
          <p className="max-w-xs text-sm text-text-muted">{BRAND.tagline}</p>
          <NewsletterForm />
          <div className="flex gap-4 text-sm text-text-muted">
            <a href={BRAND.social.instagram} target="_blank" rel="noreferrer" className="hover:text-text">Instagram</a>
            <a href={BRAND.social.youtube} target="_blank" rel="noreferrer" className="hover:text-text">YouTube</a>
          </div>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-4 font-display text-xl uppercase">{g.title}</p>
            <ul className="space-y-2 text-sm text-text-muted">
              {g.links.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:text-text">{l.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center justify-center gap-1 border-t border-border py-6 text-center text-xs text-text-muted sm:flex-row sm:gap-3">
        <span>© {new Date().getFullYear()} {BRAND.name}. Made in India.</span>
        <span className="hidden sm:inline" aria-hidden="true">·</span>
        <a href={BRAND.poweredBy.url} target="_blank" rel="noreferrer" className="hover:text-text" data-testid="powered-by">
          Powered by {BRAND.poweredBy.name}
        </a>
      </div>
    </footer>
  );
}

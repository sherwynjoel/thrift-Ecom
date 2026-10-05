"use client";

import { Logo } from "@/components/brand/logo";
import DitheredFooter, { type FooterColumn, type FooterSocial } from "@/components/ui/dithered-footer";
import { BRAND } from "@/config/brand";
import { FOOTER_LINKS } from "@/config/site";

const COLUMNS: FooterColumn[] = [
  { title: "Shop", links: [...FOOTER_LINKS.shop] },
  { title: "Help", links: [...FOOTER_LINKS.help] },
  { title: "Company", links: [...FOOTER_LINKS.company] },
];

const brandIcon = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
);

const INSTAGRAM = "M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98 1.28.06 1.69.07 4.95.07s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z";
const YOUTUBE = "M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z";

/** A social link only counts once it points at a real profile, not the bare placeholder domain. */
const isProfile = (url: string) => {
  try {
    return new URL(url).pathname.replace(/\/+$/, "").length > 0;
  } catch {
    return false;
  }
};

const SOCIALS: FooterSocial[] = [
  { label: "Instagram", href: BRAND.social.instagram, icon: brandIcon(INSTAGRAM) },
  { label: "YouTube", href: BRAND.social.youtube, icon: brandIcon(YOUTUBE) },
].filter((s) => isProfile(s.href));

export function Footer() {
  return (
    <DitheredFooter
      className="mt-24"
      testId="site-footer"
      brand={BRAND.name}
      brandMark={<Logo className="h-10" />}
      tagline={BRAND.tagline}
      columns={COLUMNS}
      socials={SOCIALS}
      legal={[]}
      copyright={`© ${new Date().getFullYear()} ${BRAND.name}. Made in India.`}
      accent="var(--accent)"
      subscribeLabel="Drops and offers, straight to your inbox"
      // ponytail: no newsletter backend yet — resolves so the thank-you shows; wire to a real list when one exists.
      onSubscribe={async () => {}}
      extra={
        <a href={BRAND.poweredBy.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center hover:text-foreground" data-testid="powered-by">
          Powered by&nbsp;<span className="font-semibold text-brand">{BRAND.poweredBy.name}</span>
        </a>
      }
    />
  );
}

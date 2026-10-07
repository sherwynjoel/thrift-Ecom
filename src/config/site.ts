export const SITE_NAV = [
  { label: "New Drops", href: "/collections/new-drops" },
  { label: "Oversized", href: "/collections/oversized-tees" },
  { label: "Regular Fit", href: "/collections/regular-fit-tees" },
  { label: "Customize", href: "/customize" },
] as const;

export const FOOTER_LINKS = {
  shop: [
    { label: "All Collections", href: "/collections" },
    { label: "New Drops", href: "/collections/new-drops" },
    { label: "Customize", href: "/customize" },
  ],
  help: [
    { label: "Shipping Policy", href: "/pages/shipping" },
    { label: "Refunds & Cancellation", href: "/pages/returns" },
    { label: "Contact Us", href: "/pages/contact" },
  ],
  company: [
    { label: "About", href: "/pages/about" },
    { label: "Privacy Policy", href: "/pages/privacy" },
    { label: "Terms & Conditions", href: "/pages/terms" },
  ],
} as const;

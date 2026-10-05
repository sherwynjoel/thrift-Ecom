import type { Metadata, Viewport } from "next";
import { Splash } from "@/components/brand/splash";
import { Toaster } from "@/components/ui/sonner";
import { BRAND } from "@/config/brand";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";
import { bodyFont, displayFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s | ${BRAND.name}` },
  description: BRAND.tagline,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  applicationName: BRAND.name,
  openGraph: { type: "website", siteName: BRAND.name, locale: "en_IN", images: [{ ...DEFAULT_OG_IMAGE, alt: BRAND.name }] },
  twitter: { card: "summary_large_image" },
};

// Never disable zoom; viewportFit "cover" exposes the notch/home-bar insets to env(safe-area-inset-*).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0A0A0A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the splash script sets data-splash on <html> before React hydrates.
    <html lang="en" className={`dark ${displayFont.variable} ${bodyFont.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Splash />
        {children}
        <Toaster theme="dark" position="bottom-center" />
      </body>
    </html>
  );
}

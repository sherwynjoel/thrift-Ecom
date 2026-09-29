import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { BRAND } from "@/config/brand";
import { bodyFont, displayFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s | ${BRAND.name}` },
  description: BRAND.tagline,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster theme="dark" position="bottom-center" />
      </body>
    </html>
  );
}

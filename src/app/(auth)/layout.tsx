import Link from "next/link";
import { BRAND } from "@/config/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <Link href="/" className="font-display text-4xl uppercase tracking-tight">{BRAND.name}</Link>
      {children}
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNav } from "@/components/storefront/account/account-nav";
import { AddressBook } from "@/components/storefront/account/address-book";
import { NO_INDEX } from "@/lib/seo";
import { auth } from "@/server/auth";
import { listAddresses } from "@/server/services/addresses";

export const metadata: Metadata = { title: "Addresses", robots: NO_INDEX };

export default async function AddressesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=%2Faccount%2Faddresses");
  const addresses = await listAddresses(session.user.id);
  return (
    <div className="container-x space-y-6 py-10" data-testid="addresses-page">
      <h1 className="text-5xl md:text-7xl">Addresses</h1>
      <AccountNav />
      <AddressBook addresses={addresses} />
    </div>
  );
}

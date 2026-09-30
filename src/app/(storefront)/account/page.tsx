import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountNav } from "@/components/storefront/account/account-nav";
import { OrderCard } from "@/components/storefront/account/order-card";
import { PasswordForm } from "@/components/storefront/account/password-form";
import { ProfileForm } from "@/components/storefront/account/profile-form";
import { SignOutButton } from "@/components/storefront/account/sign-out-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/server/auth";
import { getUserById, userHasPassword } from "@/server/services/auth";
import { listOrdersForUser } from "@/server/services/orders";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=%2Faccount");
  const [user, hasPassword, recentOrders] = await Promise.all([
    getUserById(session.user.id),
    userHasPassword(session.user.id),
    listOrdersForUser(session.user.id, { pageSize: 3 }),
  ]);
  if (!user) redirect("/login?next=%2Faccount");
  return (
    <div className="container-x py-10" data-testid="account-page">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl md:text-7xl">Hey, {user.name?.split(" ")[0] ?? "there"}</h1>
          <p className="text-text-muted">{user.email}</p>
        </div>
        <SignOutButton />
      </div>
      <AccountNav />
      <Tabs defaultValue="orders">
        <TabsList className="bg-surface">
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="pt-6">
          {recentOrders.items.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-surface p-8" data-testid="orders-empty">
              <p className="font-display text-2xl">No orders yet</p>
              <p className="mt-1 text-text-muted">Your orders and tracking links will live here.</p>
              <Link href="/collections/new-drops" className="mt-4 inline-block text-sm underline-offset-4 hover:underline">Browse new drops</Link>
            </div>
          ) : (
            <div className="space-y-4">
              <ul className="space-y-3">
                {recentOrders.items.map((order) => <li key={order.id}><OrderCard order={order} /></li>)}
              </ul>
              <Link href="/account/orders" className="inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline">View all orders</Link>
            </div>
          )}
        </TabsContent>
        <TabsContent value="profile" className="pt-6"><ProfileForm name={user.name ?? ""} email={user.email} /></TabsContent>
        <TabsContent value="security" className="pt-6"><PasswordForm hasPassword={hasPassword} /></TabsContent>
      </Tabs>
    </div>
  );
}

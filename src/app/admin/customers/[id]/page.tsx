import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { CopyButton } from "@/components/admin/copy-button";
import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import { StatTile } from "@/components/admin/stat-tile";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { addressLines, addressText, formatPhone } from "@/lib/address-format";
import { telLink, whatsappLink } from "@/lib/contact-links";
import { formatDateIst } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { NotFoundError } from "@/server/errors";
import { getCustomer } from "@/server/services/admin-customers";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

const CARD = "rounded-md border border-border bg-surface p-4";

export default async function AdminCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const c = await getCustomer(id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const first = (c.name ?? "").trim().split(/\s+/)[0] || "there";

  return (
    <div className="space-y-6 pb-24 lg:pb-0" data-testid="customer-detail">
      <Link href="/admin/customers" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">← Customers</Link>
      <div>
        <h1 className="break-words text-4xl sm:text-5xl">{c.name || c.email}</h1>
        <a href={`mailto:${c.email}`} className="inline-flex min-h-11 items-center break-all text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">{c.email}</a>
        <p className="text-sm text-text-muted">Joined {formatDateIst(c.createdAt)}</p>
      </div>

      <div className="grid max-w-xl grid-cols-2 gap-3">
        <StatTile label="Paid orders" value={c.orderCount} />
        <StatTile label="Total spent" value={formatPaise(c.totalSpentPaise)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="space-y-3" aria-labelledby="addr-heading">
          <h2 id="addr-heading" className="text-2xl">Addresses</h2>
          {c.addresses.length === 0 ? (
            <p className="text-sm text-text-muted">No saved addresses.</p>
          ) : (
            c.addresses.map((a) => (
              <div key={a.id} className={CARD} data-testid="customer-address">
                <p className="font-medium">
                  {a.fullName}
                  {a.isDefault && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">Default</span>}
                </p>
                <address className="mt-1 text-sm not-italic text-text-muted">
                  {addressLines(a).map((l) => <span key={l} className="block break-words">{l}</span>)}
                </address>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Button variant="secondary" className="h-11" render={<a href={telLink(a.phone)} />} nativeButton={false}>
                    <Phone className="size-4" /> {formatPhone(a.phone)}
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-11"
                    render={<a href={whatsappLink(a.phone, `Hi ${first}, this is ${BRAND.name}.`)} target="_blank" rel="noopener noreferrer" />}
                    nativeButton={false}
                  >
                    <MessageCircle className="size-4" /> WhatsApp
                  </Button>
                  <CopyButton text={addressText(a.fullName, a.phone, a)} label={`Copy address for ${a.fullName}`} className="col-span-2 sm:col-span-1" />
                </div>
              </div>
            ))
          )}
        </section>

        <section className="space-y-3" aria-labelledby="orders-heading">
          <h2 id="orders-heading" className="text-2xl">Orders</h2>
          {c.orders.length === 0 ? (
            <p className="text-sm text-text-muted">No orders yet.</p>
          ) : (
            <ul className="rounded-md border border-border" data-testid="customer-orders">
              {c.orders.map((o) => (
                <li key={o.id} className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface/60 sm:grid-cols-[minmax(0,1fr)_120px_auto_90px]">
                  <div className="min-w-0">
                    <Link href={`/admin/orders/${o.id}`} className="font-medium after:absolute after:inset-0 hover:underline">{o.number}</Link>
                    <p className="truncate text-xs text-text-muted">{o.itemCount} {o.itemCount === 1 ? "item" : "items"} · {o.firstItemName}</p>
                  </div>
                  <p className="hidden text-sm text-text-muted sm:block">{formatDateIst(o.createdAt)}</p>
                  <span className="justify-self-end sm:justify-self-start"><OrderStatusBadge status={o.status} /></span>
                  <p className="text-sm text-text-muted sm:hidden">{formatDateIst(o.createdAt)}</p>
                  <p className="text-right text-sm font-medium tabular-nums">{formatPaise(o.totalPaise)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

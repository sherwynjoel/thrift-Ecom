import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { InvoiceDocument } from "@/components/print/invoice-document";
import { PageSize } from "@/components/print/page-size";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { isPaidStatus } from "@/lib/order-status";
import { auth } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { getOrderForUser } from "@/server/services/orders";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

export default async function InvoicePage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?next=${encodeURIComponent(`/invoice/${number}`)}`);
  const order = await getOrderForUser(session.user.id, number).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  if (!isPaidStatus(order.status) && order.status !== "REFUNDED") notFound();
  const settings = await getSettings();
  return (
    <div className="min-h-dvh bg-neutral-200 print:bg-white">
      <PageSize size="A4" margin="12mm" />
      <PrintToolbar backHref={`/account/orders/${encodeURIComponent(order.number)}`} backLabel="Order" />
      <div className="p-2 sm:p-6 print:p-0"><InvoiceDocument order={order} settings={settings} last /></div>
    </div>
  );
}

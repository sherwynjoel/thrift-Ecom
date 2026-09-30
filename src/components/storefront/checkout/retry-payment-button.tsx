"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { retryPaymentAction } from "@/app/(storefront)/checkout/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startPayment } from "./pay";

export function RetryPaymentButton({ number, className }: { number: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const retry = () =>
    start(async () => {
      const res = await retryPaymentAction(number);
      if (!res.ok) {
        toast.error(res.message);
        router.refresh();
        return;
      }
      try {
        await startPayment(res.data, router);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not open the payment window");
      }
    });

  return (
    <Button type="button" onClick={retry} disabled={pending} className={cn("h-12 w-full px-6 sm:w-auto", className)} data-testid="retry-payment">
      {pending ? "Opening…" : "Retry payment"}
    </Button>
  );
}

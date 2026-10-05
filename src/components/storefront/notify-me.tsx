"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { subscribeAction } from "@/app/(storefront)/subscribe-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NotifyMe() {
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await subscribeAction(email, "studio").catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
      if (!res.ok) return void toast.error(res.error);
      toast.success("We'll email you when the designer opens.");
      setEmail("");
    });
  };
  return (
    <form className="flex max-w-md gap-2" onSubmit={submit}>
      <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" aria-label="Email" className="bg-surface" />
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Notify me"}</Button>
    </form>
  );
}

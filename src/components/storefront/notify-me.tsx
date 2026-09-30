"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NotifyMe() {
  const [email, setEmail] = useState("");
  return (
    <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); toast.success("We'll email you when the designer opens."); setEmail(""); }}>
      <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" aria-label="Email" className="bg-surface" />
      <Button type="submit">Notify me</Button>
    </form>
  );
}

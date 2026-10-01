"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        toast.success("You're on the list.");
        setEmail("");
      }}
    >
      <Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" enterKeyHint="send" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for drops and offers" aria-label="Email" className="h-11 bg-surface" />
      <Button type="submit" variant="secondary" className="h-11 px-4">Join</Button>
    </form>
  );
}

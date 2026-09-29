"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteAddressAction, setDefaultAddressAction } from "@/app/(storefront)/account/addresses/actions";
import { AddressForm } from "@/components/storefront/account/address-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addressLines, formatPhone } from "@/lib/address-format";
import type { AddressView } from "@/server/services/addresses";

// Mirrors the server-enforced MAX_ADDRESSES (src/server/services/addresses.ts); kept as a
// local literal so this client component does not pull server/db code into its bundle.
const MAX_ADDRESSES = 10;

export function AddressBook({ addresses }: { addresses: AddressView[] }) {
  const [list, setList] = useState<AddressView[]>(addresses);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleSaved(a: AddressView) {
    setList((prev) => {
      const others = a.isDefault ? prev.map((x) => ({ ...x, isDefault: false })) : prev;
      const idx = others.findIndex((x) => x.id === a.id);
      return idx >= 0
        ? others.map((x, i) => (i === idx ? a : x))
        : [...others, a];
    });
    setEditing(null);
    toast.success("Address saved");
  }

  function handleSetDefault(id: string) {
    start(async () => {
      const res = await setDefaultAddressAction(id);
      if (res.ok) setList(res.data);
      else toast.error(res.message);
    });
  }

  function handleDelete(id: string) {
    start(async () => {
      const res = await deleteAddressAction(id);
      setConfirmingDelete(null);
      if (res.ok) setList(res.data);
      else toast.error(res.message);
    });
  }

  const atLimit = list.length >= MAX_ADDRESSES;

  return (
    <div className="space-y-6">
      {list.length === 0 && editing === null && (
        <div className="rounded-md border border-dashed border-border bg-surface p-8" data-testid="addresses-empty">
          <p className="text-text-muted">No saved addresses yet. Add one to check out faster.</p>
        </div>
      )}

      {list.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2" data-testid="address-list">
          {list.map((a) =>
            editing === a.id ? (
              <li key={a.id} className="rounded-md border border-border bg-surface p-4">
                <AddressForm initial={a} onSaved={handleSaved} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={a.id} data-testid="address-card" className="rounded-md border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{a.fullName}</p>
                  {a.isDefault && <Badge>Default</Badge>}
                </div>
                <div className="mt-1 text-sm text-text-muted">
                  {addressLines(a).map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                  <p>Phone: {formatPhone(a.phone)}</p>
                </div>
                {confirmingDelete === a.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm">Delete this address?</span>
                    <Button variant="ghost" className="h-11" disabled={pending} onClick={() => handleDelete(a.id)}>
                      Yes, delete
                    </Button>
                    <Button variant="ghost" className="h-11" onClick={() => setConfirmingDelete(null)}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="ghost" className="h-11" onClick={() => setEditing(a.id)}>
                      Edit
                    </Button>
                    {!a.isDefault && (
                      <Button variant="ghost" className="h-11" disabled={pending} onClick={() => handleSetDefault(a.id)}>
                        Set as default
                      </Button>
                    )}
                    <Button variant="ghost" className="h-11" onClick={() => setConfirmingDelete(a.id)}>
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {editing === "new" ? (
        <div className="rounded-md border border-border bg-surface p-4">
          <AddressForm forceDefault={list.length === 0} onSaved={handleSaved} onCancel={() => setEditing(null)} />
        </div>
      ) : (
        <div>
          <Button className="h-11" disabled={atLimit} onClick={() => setEditing("new")}>
            Add a new address
          </Button>
          {atLimit && <p className="mt-2 text-sm text-text-muted">You can save up to 10 addresses</p>}
        </div>
      )}
    </div>
  );
}

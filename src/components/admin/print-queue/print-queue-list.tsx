"use client";

import { useEffect, useState } from "react";
import { PrintItemCard } from "@/components/admin/print-queue/print-item-card";
import { Button } from "@/components/ui/button";
import { groupPrintQueue } from "@/lib/print-queue";
import type { PrintQueueItem } from "@/server/services/print-queue";

type View = "oldest" | "grouped";
const STORAGE_KEY = "print-queue-view";
const GRID = "grid gap-3 lg:grid-cols-2";

export function PrintQueueList({ items, now }: { items: PrintQueueItem[]; now: Date }) {
  const [view, setView] = useState<View>("oldest");

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "grouped") setView("grouped");
    } catch {
      // storage unavailable: keep the default
    }
  }, []);

  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      // storage unavailable: the choice lasts for this visit only
    }
  };

  const toggle = (v: View, label: string) => (
    <Button type="button" variant={view === v ? "default" : "secondary"} className="min-h-11 px-4" aria-pressed={view === v} onClick={() => choose(v)}>
      {label}
    </Button>
  );

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Order the queue" className="flex flex-wrap gap-2" data-testid="print-queue-view">
        {toggle("oldest", "Oldest first")}
        {toggle("grouped", "Group by colour + size")}
      </div>
      {view === "oldest" ? (
        <ul className={GRID}>
          {items.map((i) => <PrintItemCard key={i.itemId} item={i} now={now} />)}
        </ul>
      ) : (
        groupPrintQueue(items).map((g) => (
          <section key={g.key} aria-label={g.key} className="space-y-2" data-testid="print-group">
            <h2 className="text-2xl">{g.key} · {g.units} {g.units === 1 ? "tee" : "tees"}</h2>
            <ul className={GRID}>
              {g.items.map((i) => <PrintItemCard key={i.itemId} item={i} now={now} />)}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

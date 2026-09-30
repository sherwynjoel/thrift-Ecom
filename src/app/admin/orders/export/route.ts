import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/server/admin-guard";
import { toHttp } from "@/server/errors";
import { exportOrdersCsv } from "@/server/services/admin-orders";
import { parseOrderTab } from "@/lib/order-tabs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const csv = await exportOrdersCsv({ ids, tab: parseOrderTab(sp.get("tab")), q: sp.get("q") ?? undefined, attention: sp.get("attention") === "1" });
    const date = new Date().toISOString().slice(0, 10);
    // Leading BOM so Excel opens the UTF-8 file (₹, non-Latin names) correctly.
    return new NextResponse(`﻿${csv}`, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="orders-${date}.csv"`, "cache-control": "no-store" },
    });
  } catch (err) {
    const { status, body } = toHttp(err);
    return NextResponse.json(body, { status });
  }
}

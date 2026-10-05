import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin-guard";
import { toHttp } from "@/server/errors";
import { exportSubscribersCsv } from "@/server/services/subscribers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
    const csv = await exportSubscribersCsv();
    const date = new Date().toISOString().slice(0, 10);
    // Leading BOM so Excel opens the UTF-8 file correctly.
    return new NextResponse(`﻿${csv}`, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="subscribers-${date}.csv"`, "cache-control": "no-store" },
    });
  } catch (err) {
    const { status, body } = toHttp(err);
    return NextResponse.json(body, { status });
  }
}

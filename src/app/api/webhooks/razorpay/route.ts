import { NextResponse } from "next/server";
import { handleRazorpayWebhook } from "@/server/services/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const raw = await req.text();
    const r = await handleRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"));
    return NextResponse.json({ handled: r.handled }, { status: r.status });
  } catch (err) {
    // 500 makes Razorpay retry later; every handler path is idempotent.
    console.error("[webhook:razorpay]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

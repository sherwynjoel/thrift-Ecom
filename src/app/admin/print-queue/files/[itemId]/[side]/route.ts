import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin-guard";
import { NotFoundError, toHttp } from "@/server/errors";
import { getPrintFile } from "@/server/services/print-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only download of a print PNG as "<ORD-n>-<sku>-<side>.png" (/admin/* is also ADMIN-only in middleware). */
export async function GET(_req: Request, ctx: { params: Promise<{ itemId: string; side: string }> }): Promise<Response> {
  try {
    await requireAdmin();
    const { itemId, side } = await ctx.params;
    if (side !== "front" && side !== "back") throw new NotFoundError("Print file");
    const { bytes, filename } = await getPrintFile(itemId, side);
    return new Response(bytes as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const { status, body } = toHttp(err);
    return NextResponse.json(body, { status });
  }
}

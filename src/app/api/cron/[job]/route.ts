import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { toHttp } from "@/server/errors";
import { isJobName, runJob } from "@/server/jobs";
import { safeEqual } from "@/server/payments/hmac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Both sides are hashed first so the constant-time compare never short-circuits on a length difference. */
const digest = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export async function POST(req: NextRequest, ctx: { params: Promise<{ job: string }> }): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (!safeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Bad cron secret" } }, { status: 401 });
  }
  const { job } = await ctx.params;
  if (!isJobName(job)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown job" } }, { status: 404 });
  const started = Date.now();
  try {
    const result = await runJob(job);
    const ms = Date.now() - started;
    console.info(`[cron] ${job} done in ${ms}ms`, JSON.stringify(result));
    return NextResponse.json({ data: { job, result, ms } });
  } catch (err) {
    const { status, body } = toHttp(err);
    return NextResponse.json(body, { status });
  }
}

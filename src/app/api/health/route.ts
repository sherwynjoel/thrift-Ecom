import { checkHealth } from "@/server/services/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const h = await checkHealth();
  return Response.json(
    { status: h.ok ? "ok" : "error", db: h.db, version: h.version, uptimeSec: h.uptimeSec, time: h.time },
    { status: h.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

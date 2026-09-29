import { handle, ok } from "@/server/api";
import { searchProducts } from "@/server/services/catalog";

export const GET = handle(async (req) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1) || 1);
  return ok(await searchProducts(q, page));
});

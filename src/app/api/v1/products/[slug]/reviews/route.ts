import { handle, ok, requireApiUser } from "@/server/api";
import { ValidationError } from "@/server/errors";
import { createReviewBySlug, getProductReviewsBySlug } from "@/server/services/reviews";

export const GET = handle(async (req, ctx) => {
  const { slug } = await ctx.params;
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
  const { summary, reviews } = await getProductReviewsBySlug(slug, Number.isFinite(page) ? page : 1);
  return ok({ summary, ...reviews });
});

export const POST = handle(async (req, ctx) => {
  const user = await requireApiUser(req);
  const { slug } = await ctx.params;
  const body: unknown = await req.json().catch(() => {
    throw new ValidationError({ body: ["Send a JSON body"] });
  });
  return ok(await createReviewBySlug(user.id, slug, body), { status: 201 });
});

"use server";

import type { ReviewStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { actionError, type ActionResult } from "@/server/action-result";
import { requireUserId } from "@/server/session-user";
import { createReview } from "@/server/services/reviews";
import type { ReviewInput } from "@/lib/validation/review";

export async function createReviewAction(productId: string, input: ReviewInput): Promise<ActionResult<{ status: ReviewStatus }>> {
  try {
    const userId = await requireUserId();
    const { status } = await createReview(userId, productId, input);
    revalidatePath("/", "layout");   // product page, and the admin pending badge
    return { ok: true, data: { status } };
  } catch (err) {
    return actionError(err);
  }
}

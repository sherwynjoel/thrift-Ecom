"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import { ValidationError } from "@/server/errors";
import { moderateReview } from "@/server/services/admin-reviews";

export async function moderateReviewAction(id: string, status: "APPROVED" | "REJECTED"): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    if (status !== "APPROVED" && status !== "REJECTED") throw new ValidationError({ status: ["Choose approve or reject"] });
    await moderateReview(id, status);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}

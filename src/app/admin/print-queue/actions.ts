"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import { holdItem, markItemPrinted, releaseHold } from "@/server/services/print-queue";

export async function markPrintedAction(itemId: string): Promise<ActionResult<{ orderMovedToProcessing: boolean }>> {
  try {
    const { userId } = await requireAdmin();
    const data = await markItemPrinted(itemId, userId);
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (err) {
    return actionError(err);
  }
}

export async function holdItemAction(itemId: string, note: string): Promise<ActionResult<null>> {
  try {
    const { userId } = await requireAdmin();
    await holdItem(itemId, note, userId);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}

export async function releaseHoldAction(itemId: string): Promise<ActionResult<null>> {
  try {
    const { userId } = await requireAdmin();
    await releaseHold(itemId, userId);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}

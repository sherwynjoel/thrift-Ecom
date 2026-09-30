"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import { ValidationError } from "@/server/errors";
import {
  adminCancelOrder, advanceOrderStatus, BULK_LIMIT, bulkMarkProcessing, clearAttention, markRefundedManually, refundOrder, saveTracking, setAdminNote,
} from "@/server/services/admin-orders";
import type { CancelResult } from "@/server/services/orders";
import type { FulfilmentStatus } from "@/lib/order-status";
import type { TrackingInput } from "@/lib/validation/orders";

export async function advanceStatusAction(id: string, to: FulfilmentStatus): Promise<ActionResult<null>> {
  try {
    const { userId } = await requireAdmin();
    await advanceOrderStatus(id, to, userId);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}

export async function saveTrackingAction(id: string, input: TrackingInput, markShipped: boolean): Promise<ActionResult<null>> {
  try {
    const { userId } = await requireAdmin();
    await saveTracking(id, input, userId, { markShipped: markShipped === true });
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}

export async function saveAdminNoteAction(id: string, note: string): Promise<ActionResult<null>> {
  try {
    const { userId } = await requireAdmin();
    await setAdminNote(id, note, userId);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}

export async function clearAttentionAction(id: string): Promise<ActionResult<null>> {
  try {
    const { userId } = await requireAdmin();
    await clearAttention(id, userId);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}

export async function cancelOrderAction(id: string, reason: string): Promise<ActionResult<CancelResult>> {
  try {
    const { userId } = await requireAdmin();
    const result = await adminCancelOrder(id, reason, userId);
    revalidatePath("/", "layout");
    return { ok: true, data: result };
  } catch (err) {
    return actionError(err);
  }
}

export async function refundOrderAction(id: string): Promise<ActionResult<{ refundId: string | null }>> {
  try {
    const { userId } = await requireAdmin();
    const data = await refundOrder(id, userId);
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (err) {
    return actionError(err);
  }
}

export async function markRefundedAction(id: string, note: string): Promise<ActionResult<null>> {
  try {
    const { userId } = await requireAdmin();
    await markRefundedManually(id, note, userId);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}

export async function bulkMarkProcessingAction(ids: string[]): Promise<ActionResult<{ updated: number }>> {
  try {
    const { userId } = await requireAdmin();
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) throw new ValidationError({ ids: ["Select orders first"] });
    if (ids.length > BULK_LIMIT) throw new ValidationError({ ids: [`Select at most ${BULK_LIMIT} orders`] });
    const updated = await bulkMarkProcessing(ids, userId);
    revalidatePath("/", "layout");
    return { ok: true, data: { updated } };
  } catch (err) {
    return actionError(err);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import { updateSettings } from "@/server/services/settings";
import type { SettingsInput } from "@/lib/validation/settings";

export async function saveSettingsAction(input: SettingsInput): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    await updateSettings(input);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}

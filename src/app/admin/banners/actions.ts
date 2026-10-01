"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import { ValidationError } from "@/server/errors";
import { createBanner, deleteBanner, moveBanner, setBannerImage, updateBanner, type BannerSlot } from "@/server/services/banners";
import type { BannerInput } from "@/lib/validation/banner";

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    await requireAdmin();
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (err) {
    return actionError(err);
  }
}

export async function saveBannerAction(id: string | null, input: BannerInput): Promise<ActionResult<{ id: string }>> {
  return run(async () => (id ? (await updateBanner(id, input), { id }) : await createBanner(input)));
}

export async function deleteBannerAction(id: string): Promise<ActionResult<null>> {
  return run(async () => (await deleteBanner(id), null));
}

export async function moveBannerAction(id: string, direction: "up" | "down"): Promise<ActionResult<null>> {
  return run(async () => {
    if (direction !== "up" && direction !== "down") throw new ValidationError({ direction: ["Choose up or down"] });
    await moveBanner(id, direction);
    return null;
  });
}

export async function setBannerImageAction(id: string, slot: BannerSlot, formData: FormData | null): Promise<ActionResult<{ url: string | null }>> {
  return run(() => {
    if (slot !== "desktop" && slot !== "mobile") throw new ValidationError({ slot: ["Choose desktop or phone"] });
    const file = formData?.get("file");
    if (formData && !(file instanceof File && file.size > 0)) throw new ValidationError({ file: ["Choose an image"] }, "Choose an image");
    return setBannerImage(id, slot, file instanceof File ? file : null);
  });
}

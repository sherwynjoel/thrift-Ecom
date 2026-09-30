"use server";

import { revalidatePath } from "next/cache";
import { actionError, type ActionResult } from "@/server/action-result";
import { requireUserId } from "@/server/session-user";
import { createAddress, deleteAddress, listAddresses, setDefaultAddress, updateAddress, type AddressView } from "@/server/services/addresses";
import type { AddressFormValues } from "@/lib/validation/address";

function refresh() {
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
}

export async function saveAddressAction(id: string | null, input: AddressFormValues): Promise<ActionResult<AddressView>> {
  try {
    const userId = await requireUserId();
    const saved = id ? await updateAddress(userId, id, input) : await createAddress(userId, input);
    refresh();
    return { ok: true, data: saved };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteAddressAction(id: string): Promise<ActionResult<AddressView[]>> {
  try {
    const userId = await requireUserId();
    await deleteAddress(userId, id);
    refresh();
    return { ok: true, data: await listAddresses(userId) };
  } catch (err) {
    return actionError(err);
  }
}

export async function setDefaultAddressAction(id: string): Promise<ActionResult<AddressView[]>> {
  try {
    const userId = await requireUserId();
    const list = await setDefaultAddress(userId, id);
    refresh();
    return { ok: true, data: list };
  } catch (err) {
    return actionError(err);
  }
}

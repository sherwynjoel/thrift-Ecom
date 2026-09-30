"use server";

import { revalidatePath } from "next/cache";
import { zodFieldErrors } from "@/server/action-result";
import { auth, signOut } from "@/server/auth";
import { DomainError, UnauthorizedError } from "@/server/errors";
import { changePassword, updateProfile } from "@/server/services/auth";
import { changePasswordSchema, updateProfileSchema } from "@/lib/validation/auth";

export type AccountFormState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: boolean };

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user.id;
}

export async function updateProfileAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const parsed = updateProfileSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await updateProfile(await requireUserId(), parsed.data);
    revalidatePath("/account");
    return { ok: true };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
}

export async function changePasswordAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const parsed = changePasswordSchema.safeParse({ current: formData.get("current"), next: formData.get("next") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await changePassword(await requireUserId(), parsed.data.current, parsed.data.next);
    return { ok: true };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

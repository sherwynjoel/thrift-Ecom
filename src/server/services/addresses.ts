import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { addressInputSchema } from "@/lib/validation/address";

export const MAX_ADDRESSES = 10;

export interface AddressView {
  id: string; fullName: string; phone: string; line1: string; line2: string | null; landmark: string | null;
  city: string; state: string; pincode: string; isDefault: boolean;
}

const select = {
  id: true, fullName: true, phone: true, line1: true, line2: true, landmark: true,
  city: true, state: true, pincode: true, isDefault: true,
} as const;

function parse(input: unknown) {
  const r = addressInputSchema.safeParse(input);
  if (!r.success) throw new ValidationError(zodFieldErrors(r.error));
  return r.data;
}

export async function listAddresses(userId: string): Promise<AddressView[]> {
  return db.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }], select });
}

export async function getAddress(userId: string, id: string): Promise<AddressView> {
  const a = await db.address.findFirst({ where: { id, userId }, select });
  if (!a) throw new NotFoundError("Address");
  return a;
}

export async function createAddress(userId: string, input: unknown): Promise<AddressView> {
  const data = parse(input);
  return db.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) throw new ConflictError(`You can save up to ${MAX_ADDRESSES} addresses. Delete one first.`);
    const isDefault = data.isDefault || count === 0;
    if (isDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.address.create({ data: { ...data, userId, isDefault }, select });
  });
}

export async function updateAddress(userId: string, id: string, input: unknown): Promise<AddressView> {
  const data = parse(input);
  return db.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Address");
    const isDefault = existing.isDefault || data.isDefault;
    if (isDefault && !existing.isDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.address.update({ where: { id }, data: { ...data, isDefault }, select });
  });
}

export async function setDefaultAddress(userId: string, id: string): Promise<AddressView[]> {
  await db.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Address");
    await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    await tx.address.update({ where: { id }, data: { isDefault: true } });
  });
  return listAddresses(userId);
}

export async function deleteAddress(userId: string, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Address");
    await tx.address.delete({ where: { id } });
    if (existing.isDefault) {
      const next = await tx.address.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
}

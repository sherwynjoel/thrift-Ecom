import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { getStorage } from "@/server/adapters/storage";
import { MAX_QTY_PER_LINE } from "@/lib/catalog-types";
import { variantImageUrl } from "@/lib/variant-image";
import { customPrintLabel, customUnitPricePaise, designSides, NO_CUSTOM_FEES, type CustomFees } from "@/lib/custom-pricing";
import { NotFoundError, OutOfStockError, ValidationError } from "@/server/errors";
import { getCustomFees } from "@/server/services/settings";

export type CartRef = { userId: string } | { guestToken: string };
export { MAX_QTY_PER_LINE };

export interface CartLineDesign { id: string; previewUrl: string | null; label: string; editHref: string }

export interface CartLine {
  id: string;
  variantId: string;
  quantity: number;
  lineTotalPaise: number;
  product: { slug: string; name: string; imageUrl: string | null };
  variant: { size: string; colorName: string; colorHex: string; pricePaise: number; stock: number };
  design: CartLineDesign | null;
}

export interface CartView {
  id: string | null;
  items: CartLine[];
  subtotalPaise: number;
  itemCount: number;
}

export const EMPTY_CART: CartView = { id: null, items: [], subtotalPaise: 0, itemCount: 0 };

const designSelect = { id: true, frontPreviewKey: true, backPreviewKey: true, frontPrintKey: true, backPrintKey: true } as const;

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      design: { select: designSelect },
      variant: { include: { product: { include: { images: { orderBy: { sortOrder: "asc" as const } } } } } },
    },
  },
} satisfies Prisma.CartInclude;

type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

function whereRef(ref: CartRef): Prisma.CartWhereUniqueInput {
  return "userId" in ref ? { userId: ref.userId } : { guestToken: ref.guestToken };
}

export function designOwnerWhere(ref: CartRef): Prisma.DesignWhereInput {
  return "userId" in ref ? { userId: ref.userId } : { userId: null, cartToken: ref.guestToken };
}

function toView(cart: CartRow, fees: CustomFees): CartView {
  const storage = getStorage();
  const items: CartLine[] = cart.items.map((it) => {
    const p = it.variant.product;
    const sides = it.design ? designSides(it.design) : null;
    const pricePaise = customUnitPricePaise(it.variant.pricePaise ?? p.basePricePaise, sides, fees);
    const previewKey = it.design ? (it.design.frontPreviewKey ?? it.design.backPreviewKey) : null;
    const previewUrl = previewKey ? storage.getPublicUrl(previewKey) : null;
    return {
      id: it.id,
      variantId: it.variantId,
      quantity: it.quantity,
      lineTotalPaise: pricePaise * it.quantity,
      product: { slug: p.slug, name: p.name, imageUrl: previewUrl ?? variantImageUrl(p.images, it.variant.colorName) },
      variant: { size: it.variant.size, colorName: it.variant.colorName, colorHex: it.variant.colorHex, pricePaise, stock: it.variant.stock },
      design: it.design
        ? { id: it.design.id, previewUrl, label: customPrintLabel(sides) ?? "Custom print", editHref: `/customize/${p.slug}?design=${it.design.id}` }
        : null,
    };
  });
  return {
    id: cart.id,
    items,
    subtotalPaise: items.reduce((s, i) => s + i.lineTotalPaise, 0),
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
  };
}

async function findOrCreateCartId(ref: CartRef): Promise<string> {
  const existing = await db.cart.findUnique({ where: whereRef(ref), select: { id: true } });
  if (existing) return existing.id;
  const created = await db.cart.create({ data: "userId" in ref ? { userId: ref.userId } : { guestToken: ref.guestToken } });
  return created.id;
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QTY_PER_LINE) {
    throw new ValidationError({ quantity: [`Quantity must be between 0 and ${MAX_QTY_PER_LINE}`] });
  }
}

async function loadSellableVariant(variantId: string) {
  const v = await db.productVariant.findFirst({ where: { id: variantId, product: { status: "ACTIVE" } } });
  if (!v) throw new NotFoundError("Variant");
  return v;
}

/** Units of this variant held by the cart's other lines (plain + custom share one stock). */
async function qtyInOtherLines(cartId: string, variantId: string, excludeItemId: string | null): Promise<number> {
  const r = await db.cartItem.aggregate({
    where: { cartId, variantId, ...(excludeItemId ? { id: { not: excludeItemId } } : {}) },
    _sum: { quantity: true },
  });
  return r._sum.quantity ?? 0;
}

async function assertDesignFits(ref: CartRef, designId: string, variant: { productId: string; colorName: string }): Promise<void> {
  const d = await db.design.findFirst({ where: { id: designId, ...designOwnerWhere(ref) }, select: { productId: true, colorName: true } });
  if (!d) throw new NotFoundError("Design");
  if (d.productId !== variant.productId || d.colorName !== variant.colorName) {
    throw new ValidationError({ designId: ["This design was made for a different tee or color"] });
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function getCart(ref: CartRef): Promise<CartView> {
  const cart = await db.cart.findUnique({ where: whereRef(ref), include: cartInclude });
  if (!cart) return EMPTY_CART;
  const fees = cart.items.some((i) => i.designId) ? await getCustomFees() : NO_CUSTOM_FEES;
  return toView(cart, fees);
}

export async function addItem(ref: CartRef, variantId: string, quantity: number, opts: { designId?: string } = {}): Promise<CartView> {
  return addItemOnce(ref, variantId, quantity, opts, true);
}

async function addItemOnce(ref: CartRef, variantId: string, quantity: number, opts: { designId?: string }, retry: boolean): Promise<CartView> {
  assertQuantity(quantity);
  if (quantity === 0) throw new ValidationError({ quantity: ["Quantity must be at least 1"] });
  const variant = await loadSellableVariant(variantId);
  const designId = opts.designId ?? null;
  if (designId) await assertDesignFits(ref, designId, variant);
  const cartId = await findOrCreateCartId(ref);
  const existing = designId
    ? await db.cartItem.findUnique({ where: { cartId_designId: { cartId, designId } } })
    : await db.cartItem.findFirst({ where: { cartId, variantId, designId: null } });
  if (existing && existing.variantId !== variantId) throw new ValidationError({ designId: ["This design is already in your bag in another size"] });
  const next = (existing?.quantity ?? 0) + quantity;
  if (next > MAX_QTY_PER_LINE) throw new ValidationError({ quantity: [`You can add at most ${MAX_QTY_PER_LINE} of one item`] });
  const elsewhere = await qtyInOtherLines(cartId, variantId, existing?.id ?? null);
  if (next + elsewhere > variant.stock) throw new OutOfStockError(Math.max(0, variant.stock - elsewhere));
  if (existing) {
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity: next } });
  } else {
    try {
      await db.cartItem.create({ data: { cartId, variantId, designId, quantity: next } });
    } catch (err) {
      // A concurrent add created the same line first (partial unique index CartItem_cartId_variantId_plain_key
      // or cartId_designId): retry once, which now finds the line and updates it.
      if (retry && isUniqueViolation(err)) return addItemOnce(ref, variantId, quantity, opts, false);
      throw err;
    }
  }
  return getCart(ref);
}

async function ownedItem(ref: CartRef, itemId: string) {
  const item = await db.cartItem.findFirst({ where: { id: itemId, cart: whereRef(ref) }, include: { variant: true } });
  if (!item) throw new NotFoundError("Cart item");
  return item;
}

export async function updateItem(ref: CartRef, itemId: string, quantity: number): Promise<CartView> {
  assertQuantity(quantity);
  const item = await ownedItem(ref, itemId);
  if (quantity === 0) {
    await db.cartItem.delete({ where: { id: item.id } });
    return getCart(ref);
  }
  const elsewhere = await qtyInOtherLines(item.cartId, item.variantId, item.id);
  if (quantity + elsewhere > item.variant.stock) throw new OutOfStockError(Math.max(0, item.variant.stock - elsewhere));
  await db.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return getCart(ref);
}

export async function removeItem(ref: CartRef, itemId: string): Promise<CartView> {
  const item = await ownedItem(ref, itemId);
  await db.cartItem.delete({ where: { id: item.id } });
  return getCart(ref);
}

export async function mergeGuestCartIntoUser(guestToken: string, userId: string): Promise<CartView> {
  const handOver = { where: { cartToken: guestToken, userId: null }, data: { userId, cartToken: null } };
  const guest = await db.cart.findUnique({ where: { guestToken }, include: { items: { orderBy: { createdAt: "asc" }, include: { variant: true } } } });
  if (!guest) {
    await db.design.updateMany(handOver);
    return getCart({ userId });
  }
  const userCartId = await findOrCreateCartId({ userId });
  await db.$transaction(async (tx) => {
    // Designs made as a guest belong to the user from now on (the studio's "Edit design" needs this).
    await tx.design.updateMany(handOver);
    const held = new Map<string, number>();
    for (const u of await tx.cartItem.findMany({ where: { cartId: userCartId }, select: { variantId: true, quantity: true } })) {
      held.set(u.variantId, (held.get(u.variantId) ?? 0) + u.quantity);
    }
    for (const it of guest.items) {
      const inCart = held.get(it.variantId) ?? 0;
      if (it.designId) {
        const qty = Math.min(it.quantity, it.variant.stock - inCart, MAX_QTY_PER_LINE);
        if (qty <= 0) continue; // dropped with the guest cart; the design itself stays with the user
        await tx.cartItem.update({ where: { id: it.id }, data: { cartId: userCartId, quantity: qty } });
        held.set(it.variantId, inCart + qty);
        continue;
      }
      const existing = await tx.cartItem.findFirst({ where: { cartId: userCartId, variantId: it.variantId, designId: null } });
      const others = inCart - (existing?.quantity ?? 0);
      const merged = Math.min((existing?.quantity ?? 0) + it.quantity, it.variant.stock - others, MAX_QTY_PER_LINE);
      if (merged <= (existing?.quantity ?? 0)) continue;
      if (existing) await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: merged } });
      else await tx.cartItem.create({ data: { cartId: userCartId, variantId: it.variantId, quantity: merged } });
      held.set(it.variantId, others + merged);
    }
    await tx.cart.delete({ where: { id: guest.id } });
  });
  return getCart({ userId });
}

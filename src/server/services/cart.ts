import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { MAX_QTY_PER_LINE } from "@/lib/catalog-types";
import { NotFoundError, OutOfStockError, ValidationError } from "@/server/errors";

export type CartRef = { userId: string } | { guestToken: string };
export { MAX_QTY_PER_LINE };

export interface CartLine {
  id: string;
  variantId: string;
  quantity: number;
  lineTotalPaise: number;
  product: { slug: string; name: string; imageUrl: string | null };
  variant: { size: string; colorName: string; colorHex: string; pricePaise: number; stock: number };
}

export interface CartView {
  id: string | null;
  items: CartLine[];
  subtotalPaise: number;
  itemCount: number;
}

export const EMPTY_CART: CartView = { id: null, items: [], subtotalPaise: 0, itemCount: 0 };

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      variant: {
        include: {
          product: { include: { images: { orderBy: { sortOrder: "asc" as const } } } },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

function whereRef(ref: CartRef): Prisma.CartWhereUniqueInput {
  return "userId" in ref ? { userId: ref.userId } : { guestToken: ref.guestToken };
}

function toView(cart: CartRow | null): CartView {
  if (!cart) return EMPTY_CART;
  const items: CartLine[] = cart.items.map((it) => {
    const p = it.variant.product;
    const pricePaise = it.variant.pricePaise ?? p.basePricePaise;
    const colorImage = p.images.find((img) => img.colorName === it.variant.colorName) ?? p.images[0];
    return {
      id: it.id,
      variantId: it.variantId,
      quantity: it.quantity,
      lineTotalPaise: pricePaise * it.quantity,
      product: { slug: p.slug, name: p.name, imageUrl: colorImage?.url ?? null },
      variant: { size: it.variant.size, colorName: it.variant.colorName, colorHex: it.variant.colorHex, pricePaise, stock: it.variant.stock },
    };
  });
  return {
    id: cart.id,
    items,
    subtotalPaise: items.reduce((s, i) => s + i.lineTotalPaise, 0),
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
  };
}

async function findCart(ref: CartRef): Promise<CartRow | null> {
  return db.cart.findUnique({ where: whereRef(ref), include: cartInclude });
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

export async function getCart(ref: CartRef): Promise<CartView> {
  return toView(await findCart(ref));
}

export async function addItem(ref: CartRef, variantId: string, quantity: number): Promise<CartView> {
  assertQuantity(quantity);
  if (quantity === 0) throw new ValidationError({ quantity: ["Quantity must be at least 1"] });
  const variant = await loadSellableVariant(variantId);
  const cartId = await findOrCreateCartId(ref);
  const existing = await db.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  const next = (existing?.quantity ?? 0) + quantity;
  if (next > MAX_QTY_PER_LINE) throw new ValidationError({ quantity: [`You can add at most ${MAX_QTY_PER_LINE} of one item`] });
  if (next > variant.stock) throw new OutOfStockError(variant.stock);
  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId } },
    update: { quantity: next },
    create: { cartId, variantId, quantity: next },
  });
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
  if (quantity > item.variant.stock) throw new OutOfStockError(item.variant.stock);
  await db.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return getCart(ref);
}

export async function removeItem(ref: CartRef, itemId: string): Promise<CartView> {
  const item = await ownedItem(ref, itemId);
  await db.cartItem.delete({ where: { id: item.id } });
  return getCart(ref);
}

export async function mergeGuestCartIntoUser(guestToken: string, userId: string): Promise<CartView> {
  const guest = await db.cart.findUnique({ where: { guestToken }, include: { items: { include: { variant: true } } } });
  if (!guest) return getCart({ userId });
  const userCartId = await findOrCreateCartId({ userId });
  await db.$transaction(async (tx) => {
    for (const it of guest.items) {
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: userCartId, variantId: it.variantId } } });
      const merged = Math.min((existing?.quantity ?? 0) + it.quantity, it.variant.stock, MAX_QTY_PER_LINE);
      if (merged <= 0) continue;
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: userCartId, variantId: it.variantId } },
        update: { quantity: merged },
        create: { cartId: userCartId, variantId: it.variantId, quantity: merged },
      });
    }
    await tx.cart.delete({ where: { id: guest.id } });
  });
  return getCart({ userId });
}

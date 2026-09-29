import type { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { slugify } from "@/lib/slug";
import { SEED_COLLECTIONS, SEED_PRODUCTS } from "./catalog-data";
import { teeSvg } from "./tee-svg";

export interface SeedOptions {
  adminEmail: string;
  adminPassword: string;
  publicDir: string;
}

export interface SeedResult {
  collections: number;
  products: number;
  variants: number;
}

function stockFor(index: number, low: boolean | undefined): number {
  if (low) return (index % 3) + 1;
  return 8 + ((index * 7) % 30);
}

export async function runSeed(db: PrismaClient, opts: SeedOptions): Promise<SeedResult> {
  const passwordHash = await hash(opts.adminPassword, 10);
  await db.user.upsert({
    where: { email: opts.adminEmail },
    update: { role: "ADMIN", passwordHash },
    create: { email: opts.adminEmail, name: "Admin", role: "ADMIN", passwordHash },
  });

  const seedDir = join(opts.publicDir, "seed");
  mkdirSync(seedDir, { recursive: true });

  for (const c of SEED_COLLECTIONS) {
    await db.collection.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description, isFeatured: c.isFeatured, sortOrder: c.sortOrder, isActive: true },
      create: { ...c, isActive: true },
    });
  }

  for (const [pi, p] of SEED_PRODUCTS.entries()) {
    const slug = slugify(p.name);
    const existing = await db.product.findUnique({ where: { slug } });
    if (existing) continue;

    const images = p.colors.flatMap((c, ci) => {
      const key = slugify(c.name);
      const front = `tee-${key}-front.svg`;
      const back = `tee-${key}-back.svg`;
      writeFileSync(join(seedDir, front), teeSvg(c.hex, "front"));
      writeFileSync(join(seedDir, back), teeSvg(c.hex, "back"));
      return [
        { url: `/seed/${front}`, alt: `${p.name} in ${c.name}, front`, colorName: c.name, sortOrder: ci * 2 },
        { url: `/seed/${back}`, alt: `${p.name} in ${c.name}, back`, colorName: c.name, sortOrder: ci * 2 + 1 },
      ];
    });

    let vi = 0;
    const variants = p.colors.flatMap((c) =>
      p.sizes.map((size) => ({
        sku: `${slug.toUpperCase()}-${slugify(c.name).toUpperCase()}-${size}`,
        size,
        colorName: c.name,
        colorHex: c.hex,
        stock: stockFor(pi * 10 + vi++, p.lowStock),
        sortOrder: vi,
      })),
    );

    const collections = await db.collection.findMany({ where: { slug: { in: p.collections } }, select: { id: true } });

    await db.product.create({
      data: {
        name: p.name,
        slug,
        description: p.description,
        fit: p.fit,
        basePricePaise: p.pricePaise,
        compareAtPricePaise: p.compareAtPaise,
        isCustomizable: p.isCustomizable ?? false,
        status: "ACTIVE",
        createdAt: new Date(Date.now() - pi * 86_400_000),
        images: { create: images },
        variants: { create: variants },
        collections: { create: collections.map((c, i) => ({ collectionId: c.id, sortOrder: pi * 10 + i })) },
      },
    });
  }

  const [collections, products, variants] = await Promise.all([db.collection.count(), db.product.count(), db.productVariant.count()]);
  return { collections, products, variants };
}

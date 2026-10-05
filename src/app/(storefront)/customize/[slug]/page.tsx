import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioLoader } from "@/components/studio/studio-loader";
import type { StudioInitialDesign } from "@/components/studio/studio";
import { resolveCartRef } from "@/server/cart-ref";
import { NotFoundError } from "@/server/errors";
import { getDesignForOwner, getStudioProduct, type StudioProduct } from "@/server/services/designs";
import { EMPTY_SIDE } from "@/lib/studio/canvas-json";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ color?: string; design?: string }> };

async function load(slug: string): Promise<StudioProduct> {
  try {
    return await getStudioProduct(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await load(slug);
  return {
    title: `Customize ${product.name}`,
    description: `Design your own ${product.name} — upload artwork or type a line, front and back, and we print it for you.`,
    alternates: { canonical: `/customize/${slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function StudioPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const product = await load(slug);
  let initialDesign: StudioInitialDesign | null = null;
  if (typeof sp.design === "string" && sp.design) {
    const ref = await resolveCartRef({ create: false });
    const d = ref ? await getDesignForOwner(ref, sp.design).catch((err) => (err instanceof NotFoundError ? null : Promise.reject(err))) : null;
    if (d && d.productId === product.id) {
      initialDesign = { designId: d.id, colorName: d.colorName, front: d.front ?? EMPTY_SIDE, back: d.back ?? EMPTY_SIDE };
    }
  }
  const color = typeof sp.color === "string" ? sp.color : null;
  const initialColor = initialDesign?.colorName ?? (color && product.variants.some((v) => v.colorName === color) ? color : null);
  return (
    <div className="container-x py-4 pb-40 md:py-8 md:pb-10">
      <StudioLoader product={product} initialColor={initialColor} initialDesign={initialDesign} />
    </div>
  );
}

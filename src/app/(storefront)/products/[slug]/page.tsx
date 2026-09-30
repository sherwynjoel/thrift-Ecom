import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductAccordions } from "@/components/storefront/product-accordions";
import { ProductPurchase } from "@/components/storefront/product-purchase";
import { RelatedProducts } from "@/components/storefront/related-products";
import { BRAND } from "@/config/brand";
import { jsonLdScript } from "@/lib/json-ld";
import { readPage } from "@/server/content";
import { NotFoundError } from "@/server/errors";
import { getProductBySlug, getRelatedProducts } from "@/server/services/catalog";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  try {
    return await getProductBySlug(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await load(slug);
  return {
    title: product.name,
    description: product.description.slice(0, 160) || `${product.name} by ${BRAND.name}`,
    openGraph: { images: product.images[0] ? [{ url: product.images[0].url }] : [] },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await load(slug);
  const [related, shipping, returns] = await Promise.all([getRelatedProducts(product.id, 4), readPage("shipping"), readPage("returns")]);
  const crumb = product.collections[0];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.images.map((i) => i.url),
    description: product.description,
    brand: { "@type": "Brand", name: BRAND.name },
    offers: { "@type": "Offer", priceCurrency: "INR", price: (product.pricePaise / 100).toFixed(2), availability: product.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock" },
  };

  return (
    <div className="container-x py-8 pb-28 lg:pb-10">
      <nav className="mb-6 text-xs text-text-muted" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-text">Home</Link>
        {crumb && <> / <Link href={`/collections/${crumb.slug}`} className="hover:text-text">{crumb.name}</Link></>}
        {" / "}<span className="text-text">{product.name}</span>
      </nav>
      <ProductPurchase product={product} />
      <ProductAccordions product={product} shipping={shipping?.body ?? ""} returns={returns?.body ?? ""} />
      <RelatedProducts products={related} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
    </div>
  );
}

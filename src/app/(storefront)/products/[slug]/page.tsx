import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackEvent } from "@/components/analytics/track-event";
import { ProductAccordions } from "@/components/storefront/product-accordions";
import { ProductPurchase } from "@/components/storefront/product-purchase";
import { RelatedProducts } from "@/components/storefront/related-products";
import { ProductReviews } from "@/components/storefront/reviews/product-reviews";
import { BRAND } from "@/config/brand";
import { jsonLdScript, productJsonLd } from "@/lib/json-ld";
import { productMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site-url";
import { auth } from "@/server/auth";
import { readPage } from "@/server/content";
import { NotFoundError } from "@/server/errors";
import { getProductBySlug, getRelatedProducts } from "@/server/services/catalog";
import { getRatingSummary, getReviewEligibility, listApprovedReviews } from "@/server/services/reviews";

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
  return productMetadata(product, BRAND.name);
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await load(slug);
  const session = await auth();
  const [related, shipping, returns, summary, firstPage, eligibility] = await Promise.all([
    getRelatedProducts(product.id, 4), readPage("shipping"), readPage("returns"),
    getRatingSummary(product.id), listApprovedReviews(product.id, 1), getReviewEligibility(session?.user?.id ?? null, product.id),
  ]);
  const crumb = product.collections[0];
  const jsonLd = productJsonLd({ product, url: absoluteUrl(`/products/${product.slug}`), brandName: BRAND.name, summary, reviews: firstPage.items });

  return (
    <div className="container-x py-8 pb-28 lg:pb-10">
      <nav className="-mt-3 mb-3 text-xs text-text-muted" aria-label="Breadcrumb">
        <Link href="/" className="inline-flex min-h-11 min-w-11 items-center align-middle hover:text-text">Home</Link>
        {crumb && <> / <Link href={`/collections/${crumb.slug}`} className="inline-flex min-h-11 items-center align-middle hover:text-text">{crumb.name}</Link></>}
        {" / "}<span className="text-text">{product.name}</span>
      </nav>
      <ProductPurchase product={product} rating={summary.count > 0 ? { average: summary.average, count: summary.count } : null} />
      <ProductAccordions product={product} shipping={shipping?.body ?? ""} returns={returns?.body ?? ""} />
      <ProductReviews productId={product.id} slug={product.slug} summary={summary} firstPage={firstPage} eligibility={eligibility} />
      <RelatedProducts products={related} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <TrackEvent event={{ name: "view_item", item: { id: product.id, name: product.name, pricePaise: product.pricePaise } }} />
    </div>
  );
}

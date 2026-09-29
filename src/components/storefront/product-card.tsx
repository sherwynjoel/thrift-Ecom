import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { ProductCard as Card } from "@/server/services/catalog";
import { ColorDots } from "./color-dots";
import { Price } from "./price";

const FIT_LABEL: Record<Card["fit"], string> = { OVERSIZED: "Oversized", REGULAR: "Regular", RELAXED: "Relaxed" };

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const [front, back] = product.images;
  return (
    <article className="group" data-testid="product-card">
      <Link href={`/products/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-surface">
          {front && <Image src={front.url} alt={front.alt} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" priority={priority} className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />}
          {back && <Image src={back.url} alt="" fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" aria-hidden="true" />}
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            <Badge variant="secondary" className="uppercase">{FIT_LABEL[product.fit]}</Badge>
            {product.soldOut && <Badge variant="destructive" className="uppercase">Sold out</Badge>}
            {!product.soldOut && product.lowStock && <Badge className="uppercase">Low stock</Badge>}
            {product.isCustomizable && <Badge variant="outline" className="uppercase">Customizable</Badge>}
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <h3 className="line-clamp-2 font-sans text-sm font-medium normal-case tracking-normal">{product.name}</h3>
          <Price pricePaise={product.pricePaise} compareAtPricePaise={product.compareAtPricePaise} />
          <ColorDots colors={product.colors} />
        </div>
      </Link>
    </article>
  );
}

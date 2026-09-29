import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Markdown } from "@/lib/markdown";
import type { ProductDetail } from "@/server/services/catalog";

export function ProductAccordions({ product, shipping, returns }: { product: ProductDetail; shipping: string; returns: string }) {
  return (
    <Accordion multiple defaultValue={["description"]} className="mt-12 max-w-3xl" data-testid="product-accordions">
      <AccordionItem value="description"><AccordionTrigger className="font-display text-xl uppercase">Description</AccordionTrigger><AccordionContent><Markdown source={product.description || "No description yet."} /></AccordionContent></AccordionItem>
      <AccordionItem value="care"><AccordionTrigger className="font-display text-xl uppercase">Fabric &amp; care</AccordionTrigger><AccordionContent><Markdown source={`- ${product.fabric}\n- Machine wash cold, inside out\n- Do not bleach or tumble dry\n- Iron on reverse, never on the print`} /></AccordionContent></AccordionItem>
      <AccordionItem value="shipping"><AccordionTrigger className="font-display text-xl uppercase">Shipping</AccordionTrigger><AccordionContent><Markdown source={shipping} /></AccordionContent></AccordionItem>
      <AccordionItem value="returns"><AccordionTrigger className="font-display text-xl uppercase">Returns &amp; exchange</AccordionTrigger><AccordionContent><Markdown source={returns} /></AccordionContent></AccordionItem>
    </Accordion>
  );
}

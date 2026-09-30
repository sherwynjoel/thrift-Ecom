import { isHttpUrl } from "@/lib/url";

export interface Carrier { id: string; name: string; trackingUrl: string | null }

// "{n}" is replaced by the URL-encoded tracking number. Templates are best effort: verify each once with a real
// AWB before launch (README) and edit here if a carrier changes its site. null = no public deep link.
export const CARRIERS = [
  { id: "delhivery", name: "Delhivery", trackingUrl: "https://www.delhivery.com/track/package/{n}" },
  { id: "dtdc", name: "DTDC", trackingUrl: "https://www.dtdc.in/tracking.asp?strCnno={n}" },
  { id: "india-post", name: "India Post", trackingUrl: null },
  { id: "bluedart", name: "Blue Dart", trackingUrl: "https://www.bluedart.com/tracking?trackFor=0&trackNo={n}" },
  { id: "xpressbees", name: "Xpressbees", trackingUrl: "https://www.xpressbees.com/shipment/tracking?awbNo={n}" },
  { id: "ekart", name: "Ekart", trackingUrl: "https://ekartlogistics.com/shipmenttrack/{n}" },
  { id: "shadowfax", name: "Shadowfax", trackingUrl: null },
  { id: "other", name: "Other", trackingUrl: null },
] as const satisfies readonly Carrier[];

export type CarrierId = (typeof CARRIERS)[number]["id"];
export const CARRIER_IDS = CARRIERS.map((c) => c.id) as [CarrierId, ...CarrierId[]];

export function carrierById(id: string): Carrier | undefined {
  return CARRIERS.find((c) => c.id === id);
}

/** Maps a saved carrier display name (what the order row stores) back to its id. */
export function carrierIdByName(name: string | null | undefined): CarrierId | undefined {
  return CARRIERS.find((c) => c.name === name)?.id;
}

export function trackingUrlFor(carrierId: string, trackingNumber: string, customUrl?: string | null): string | null {
  if (customUrl && isHttpUrl(customUrl)) return customUrl;
  const template = carrierById(carrierId)?.trackingUrl;
  return template ? template.replace("{n}", encodeURIComponent(trackingNumber)) : null;
}

import type { Page } from "@playwright/test";

export interface AuditRoute { name: string; path: string }

export const PUBLIC_ROUTES: AuditRoute[] = [
  { name: "home", path: "/" },
  { name: "collections", path: "/collections" },
  { name: "collection", path: "/collections/new-drops" },
  { name: "search", path: "/search?q=tee" },
  { name: "cart", path: "/cart" },
  { name: "page-shipping", path: "/pages/shipping" },
  { name: "customize", path: "/customize" },
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
  { name: "forgot-password", path: "/forgot-password" },
  { name: "not-found", path: "/this-page-does-not-exist" },
];

export const CUSTOMER_ROUTES: AuditRoute[] = [
  { name: "account", path: "/account" },
  { name: "account-orders", path: "/account/orders" },
  { name: "account-addresses", path: "/account/addresses" },
  { name: "account-wishlist", path: "/account/wishlist" },
  { name: "checkout", path: "/checkout" },
];

export const ADMIN_ROUTES: AuditRoute[] = [
  { name: "admin", path: "/admin" },
  { name: "admin-orders", path: "/admin/orders" },
  { name: "admin-print-queue", path: "/admin/print-queue" },
  { name: "admin-products", path: "/admin/products" },
  { name: "admin-product-new", path: "/admin/products/new" },
  { name: "admin-collections", path: "/admin/collections" },
  { name: "admin-collection-new", path: "/admin/collections/new" },
  { name: "admin-inventory", path: "/admin/inventory" },
  { name: "admin-customers", path: "/admin/customers" },
  { name: "admin-reviews", path: "/admin/reviews" },
  { name: "admin-coupons", path: "/admin/coupons" },
  { name: "admin-coupon-new", path: "/admin/coupons/new" },
  { name: "admin-offers", path: "/admin/offers" },
  { name: "admin-offer-new", path: "/admin/offers/new" },
  { name: "admin-banners", path: "/admin/banners" },
  { name: "admin-banner-new", path: "/admin/banners/new" },
  { name: "admin-settings", path: "/admin/settings" },
];

async function firstHref(page: Page, selector: string): Promise<string | null> {
  const link = page.locator(selector).first();
  return (await link.count()) > 0 ? link.getAttribute("href") : null;
}

/** First product page and first studio page (Phase 3). */
export async function discoverStorefrontRoutes(page: Page): Promise<AuditRoute[]> {
  const out: AuditRoute[] = [];
  await page.goto("/collections/new-drops");
  const product = await firstHref(page, '[data-testid="product-card"] a[href^="/products/"]');
  if (product) out.push({ name: "product", path: product });
  await page.goto("/customize");
  const studio = await firstHref(page, '[data-testid="studio-product-card"]');
  if (studio) out.push({ name: "studio", path: studio });
  return out;
}

/** First product editor, order, collection, banner, customer, coupon and offer. */
export async function discoverAdminRoutes(page: Page): Promise<AuditRoute[]> {
  const found: [string, string, string][] = [
    ["admin-product-edit", "/admin/products", '[data-testid="product-row"] a[href^="/admin/products/"]'],
    ["admin-order", "/admin/orders", '[data-testid="order-row"] a[href^="/admin/orders/"]'],
    ["admin-collection-edit", "/admin/collections", '[data-testid="collection-row"] a[href^="/admin/collections/"]'],
    ["admin-banner-edit", "/admin/banners", '[data-testid="banner-row"] a[href^="/admin/banners/"]'],
    ["admin-customer", "/admin/customers", '[data-testid="customer-row"] a[href^="/admin/customers/"]'],
    ["admin-coupon-edit", "/admin/coupons", '[data-testid="coupon-row"] a[href^="/admin/coupons/"]'],
    ["admin-offer-edit", "/admin/offers", '[data-testid="offer-row"] a[href^="/admin/offers/"]'],
  ];
  const out: AuditRoute[] = [];
  for (const [name, list, selector] of found) {
    await page.goto(list);
    const href = await firstHref(page, selector);
    if (href) out.push({ name, path: href });
  }
  return out;
}

/** Fonts ready plus a short pause for entrance animations. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(300);
}

export async function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; viewport: number; culprits: string[] }> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const culprits: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= viewport + 1) continue;
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== "visible") { clipped = true; break; }
      }
      if (clipped) continue;
      culprits.push(`${el.tagName.toLowerCase()}${el.dataset.testid ? `[data-testid=${el.dataset.testid}]` : ""}.${[...el.classList].slice(0, 3).join(".")} right=${Math.round(r.right)}`);
      if (culprits.length >= 5) break;
    }
    return { scrollWidth: document.documentElement.scrollWidth, viewport, culprits };
  });
}

/** Interactive elements smaller than min × min px, e.g. `button[data-testid=x] "Label" 36×36`. */
export async function smallTapTargets(page: Page, min = 44): Promise<string[]> {
  return page.evaluate((min) => {
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="radio"], [role="checkbox"], [role="tab"], [role="switch"], [role="option"]';
    const ok = (r: DOMRect) => r.width >= min - 0.5 && r.height >= min - 0.5;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (el.closest('[data-tap-exempt], [aria-hidden="true"], [inert]')) continue;
      const style = getComputedStyle(el);
      // Not rendered (display: none on an ancestor, e.g. the desktop-only filter rail on a phone).
      if (style.visibility === "hidden" || !el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) {
        // Visually hidden inputs (sr-only radios/checkboxes) count through their label.
        const label = el.closest("label") ?? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
        if (!label || ok(label.getBoundingClientRect())) continue;
        out.push(`label for ${el.tagName.toLowerCase()}[name=${el.getAttribute("name") ?? ""}] ${Math.round(label.getBoundingClientRect().width)}×${Math.round(label.getBoundingClientRect().height)}`);
        continue;
      }
      // Inline links inside running text (WCAG 2.5.8 inline exception), e.g. "Read our <a>returns policy</a>."
      if (el.tagName === "A" && style.display === "inline" && el.closest("p")) continue;
      if (ok(r)) continue;
      // Stretched links (after:absolute after:inset-0): the tap area is the positioned ancestor, e.g. a whole list row.
      // Only a real stretch counts: the ::after must be absolutely positioned AND pinned to all four edges (inset 0).
      const after = getComputedStyle(el, "::after");
      if (after.position === "absolute" && [after.top, after.right, after.bottom, after.left].every((v) => v === "0px")) {
        let box = el.parentElement;
        while (box && getComputedStyle(box).position === "static") box = box.parentElement;
        if (box && ok(box.getBoundingClientRect())) continue;
      }
      const label = (el as HTMLInputElement).type === "checkbox" || (el as HTMLInputElement).type === "radio" ? el.closest("label") : null;
      if (label && ok(label.getBoundingClientRect())) continue;
      const name = el.getAttribute("aria-label") || el.textContent?.trim().replace(/\s+/g, " ").slice(0, 30) || el.getAttribute("name") || "";
      out.push(`${el.tagName.toLowerCase()}${el.dataset.testid ? `[data-testid=${el.dataset.testid}]` : ""} "${name}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  }, min);
}

import { expect, test, type Page } from "@playwright/test";
import { addFirstProductToBag, checkoutWithMockPayment, login, register, uniqueEmail } from "./helpers";
import {
  ADMIN_ROUTES, CUSTOMER_ROUTES, PUBLIC_ROUTES, discoverAdminRoutes, discoverStorefrontRoutes, horizontalOverflow, settle, smallTapTargets, type AuditRoute,
} from "./routes";

async function audit(page: Page, routes: AuditRoute[]) {
  for (const r of routes) {
    await page.goto(r.path);
    await settle(page);
    const o = await horizontalOverflow(page);
    expect.soft(o.scrollWidth, `${r.path} scrolls sideways (${o.scrollWidth}px > ${o.viewport}px): ${o.culprits.join(" | ")}`).toBeLessThanOrEqual(o.viewport);
    expect.soft(await smallTapTargets(page), `${r.path} has tap targets under 44 px`).toEqual([]);
  }
}

test.describe("mobile layout at 360 × 740", () => {
  test("storefront pages", async ({ page }) => {
    test.slow();
    await audit(page, [...PUBLIC_ROUTES, ...(await discoverStorefrontRoutes(page))]);
  });

  test("customer pages", async ({ page }) => {
    test.setTimeout(240_000);
    await register(page, uniqueEmail("m360"));
    await addFirstProductToBag(page);
    await audit(page, CUSTOMER_ROUTES);
    const order = await checkoutWithMockPayment(page);
    await audit(page, [
      { name: "order-success", path: new URL(page.url()).pathname },
      { name: "account-order", path: `/account/orders/${order}` },
    ]);
  });

  test("admin pages", async ({ page }) => {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    test.skip(!email || !password, "ADMIN_EMAIL/ADMIN_PASSWORD must be set in .env");
    test.setTimeout(300_000);
    await login(page, email!, password!);
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
    await audit(page, [...ADMIN_ROUTES, ...(await discoverAdminRoutes(page))]);
    await page.goto("/admin");
    await page.getByTestId("admin-menu").click();
    await expect(page.getByRole("dialog").getByRole("link", { name: /orders/i })).toBeVisible();
    await page.getByRole("dialog").getByRole("link", { name: /orders/i }).click();
    await expect(page).toHaveURL(/\/admin\/orders/);
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

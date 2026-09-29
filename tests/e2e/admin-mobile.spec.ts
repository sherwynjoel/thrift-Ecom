import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;

// Pinned to a specific phone size rather than the mobile project's own device viewport: this is the
// width the final review computed the admin nav overflow against (I1/I2).
test.use({ viewport: { width: 390, height: 844 } });

async function assertNoPageOverflow(page: Page) {
  const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflowing).toBe(false);
}

async function assertAdminChromeOk(page: Page) {
  await expect(page.getByTestId("sign-out")).toBeVisible();
  await assertNoPageOverflow(page);
}

test.describe("admin at phone width", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "ADMIN_EMAIL/ADMIN_PASSWORD must be set in .env");

  test("nav, sign out and layout stay usable with no horizontal scroll", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    await page.goto("/admin");
    await expect(page.getByTestId("admin-dashboard")).toBeVisible();
    await assertAdminChromeOk(page);

    await page.goto("/admin/products");
    await expect(page.getByTestId("products-count")).toBeVisible();
    await assertAdminChromeOk(page);

    await page.getByTestId("product-row").first().getByRole("link").first().click();
    await expect(page.getByTestId("product-editor")).toBeVisible();
    await assertAdminChromeOk(page);

    await page.goto("/admin/collections");
    await expect(page.getByTestId("collections-table")).toBeVisible();
    await assertAdminChromeOk(page);
  });
});

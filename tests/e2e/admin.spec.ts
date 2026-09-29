import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { login, register, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;

async function loginAdmin(page: Page) {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  // The sign-in server action redirects through /auth/after-login before landing on `next`; that
  // redirect chain (and the session cookie it sets) runs async after the click resolves, so wait
  // for the client to leave /login before navigating away ourselves, or we can race the cookie.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  await page.goto("/admin");
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
}

test.describe("admin", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "ADMIN_EMAIL/ADMIN_PASSWORD must be set in .env");

  test("customers are sent to login", async ({ page }) => {
    await register(page, uniqueEmail("not-admin"));
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("dashboard and product list", async ({ page }) => {
    await loginAdmin(page);
    await page.getByRole("link", { name: "Products", exact: true }).click();
    await expect(page.getByTestId("product-row").first()).toBeVisible();
    await page.getByLabel("Search products").fill("blank");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/q=blank/);
    const rows = page.getByTestId("product-row");
    expect(await rows.count()).toBeGreaterThan(0);
    for (const t of await rows.allTextContents()) expect(t.toLowerCase()).toContain("blank");
  });

  test("create, publish, image, storefront, archive, delete", async ({ page }) => {
    test.slow();
    const name = `E2E Tee ${Date.now()}`;
    await loginAdmin(page);
    await page.goto("/admin/products/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Price (₹)", { exact: true }).fill("649");
    await page.getByTestId("size-toggle").filter({ hasText: /^S$/ }).click();
    await page.getByTestId("size-toggle").filter({ hasText: /^M$/ }).click();
    await expect(page.getByTestId("variant-row")).toHaveCount(2);
    await page.getByLabel("Stock for all variants").fill("7");
    await page.getByRole("button", { name: "Apply" }).click();

    // Publishing without variants is covered in unit tests; here publish with variants.
    await page.getByTestId("status-select").selectOption("ACTIVE");
    await page.getByTestId("save-product").click();
    await expect(page).toHaveURL(/\/admin\/products\/[^/]+$/);
    await expect(page.getByTestId("status-badge").first()).toHaveText(/active/i);

    await page.getByTestId("image-input").setInputFiles(path.join(__dirname, "..", "fixtures", "pixel.png"));
    await expect(page.getByTestId("image-item")).toHaveCount(1);

    const storeHref = await page.getByTestId("view-on-store").getAttribute("href");
    await page.goto(storeHref!);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name, { ignoreCase: true });
    await expect(page.getByTestId("size-chip")).toHaveCount(2);

    await page.goBack();
    await page.getByTestId("status-select").selectOption("ARCHIVED");
    await page.getByTestId("save-product").click();
    await expect(page.getByTestId("status-badge").first()).toHaveText(/archived/i);
    // The product page streams behind a `loading.tsx` boundary, so Next.js flushes the 200 status
    // before the async server component's `notFound()` call can run; the HTTP status can't go to
    // 404 here, but the rendered page does swap to the not-found UI. Assert on that instead.
    await page.goto(storeHref!);
    await expect(page.getByTestId("not-found")).toBeVisible();

    await page.goBack();
    await page.getByTestId("delete-product").click();
    await page.getByTestId("confirm-delete").click();
    await expect(page).toHaveURL(/\/admin\/products$/);
  });

  test("collection create, delete", async ({ page }) => {
    const name = `E2E Collection ${Date.now()}`;
    await loginAdmin(page);
    await page.goto("/admin/collections/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByTestId("save-collection").click();
    await expect(page).toHaveURL(/\/admin\/collections\/[^/]+$/);
    await expect(page.getByTestId("collection-products")).toContainText("No products yet");
    await page.getByTestId("delete-collection").click();
    await page.getByTestId("confirm-delete-collection").click();
    await expect(page).toHaveURL(/\/admin\/collections$/);
    await expect(page.getByTestId("collections-table")).not.toContainText(name);
  });
});

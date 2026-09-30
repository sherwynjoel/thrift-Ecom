import { expect, test, type Browser, type Page } from "@playwright/test";
import { addFirstProductToBag, checkoutWithMockPayment, login, register, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function adminPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  // Wait for the sign-in redirect chain (and its session cookie) before navigating ourselves.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  await page.goto("/admin");
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
  return page;
}

test.describe("checkout and fulfilment", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "ADMIN_EMAIL/ADMIN_PASSWORD must be set in .env");

  test("customer pays with the mock provider; admin prints a label and ships with tracking", async ({ page, browser }) => {
    test.slow();
    await register(page, uniqueEmail("buyer"), "Asha Rao");
    await addFirstProductToBag(page);
    const number = await checkoutWithMockPayment(page);
    await expect(page.getByTestId("order-success")).toContainText(/confirmed/i);
    await expect(page.getByTestId("order-number")).toHaveText(number);

    await page.goto("/account/orders");
    const row = page.getByTestId("account-order-row").filter({ hasText: number });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByTestId("order-stepper")).toBeVisible();
    await expect(page.getByTestId("invoice-link")).toBeVisible();

    const admin = await adminPage(browser);
    await admin.goto(`/admin/orders?q=${encodeURIComponent(number)}`);
    // exact: ORD-12 must not also match ORD-120 in the search results.
    await admin.getByTestId("order-row").getByRole("link", { name: number, exact: true }).click();
    // The order page may compile on first visit in dev; allow for that before asserting.
    await admin.waitForURL(/\/admin\/orders\/[^/?]+$/, { timeout: 30_000 });
    await expect(admin.getByTestId("admin-order")).toBeVisible({ timeout: 30_000 });
    const orderId = new URL(admin.url()).pathname.split("/").pop()!;

    const label = await admin.context().newPage();
    await label.goto(`/admin/orders/print?doc=label&ids=${orderId}`);
    await expect(label.getByTestId("shipping-label")).toHaveCount(1);
    await expect(label.getByTestId("shipping-label").getByRole("img", { name: `Barcode ${number}` })).toBeVisible();
    await expect(label.getByTestId("shipping-label")).toContainText("560001");
    await label.close();

    await admin.getByLabel("Carrier").selectOption("delhivery");
    await admin.getByLabel("Tracking number").fill("E2E1234567");
    await admin.getByRole("button", { name: "Save & mark shipped" }).click();
    await expect(admin.getByTestId("order-status").first()).toHaveText(/shipped/i);
    await admin.context().close();

    await page.reload();
    await expect(page.getByText("E2E1234567")).toBeVisible();
    await expect(page.getByTestId("order-status").first()).toHaveText(/shipped/i);
  });

  test("a failed payment can be retried", async ({ page }) => {
    test.slow();
    await register(page, uniqueEmail("retry"));
    await addFirstProductToBag(page);
    await checkoutWithMockPayment(page, "fail");
    await expect(page.getByRole("heading", { name: /payment not completed/i })).toBeVisible();
    await page.getByTestId("retry-payment").click();
    await expect(page).toHaveURL(/\/checkout\/mock-pay\//);
    await page.getByTestId("mock-pay-succeed").click();
    await expect(page.getByTestId("order-success")).toBeVisible();
  });
});

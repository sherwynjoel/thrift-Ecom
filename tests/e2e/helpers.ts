import { expect, type Browser, type Page } from "@playwright/test";

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export const PASSWORD = "e2e-password-123";

export async function register(page: Page, email: string, name = "E2E Tester") {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByTestId("account-link")).toHaveAttribute("href", "/account");
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
}

export async function addFirstProductToBag(page: Page) {
  await page.goto("/collections/oversized-tees");
  await page.getByTestId("product-card").first().getByRole("link").first().click();
  await expect(page.getByTestId("add-to-cart")).toBeVisible();
  const chip = page.locator('[data-testid="size-chip"]:not([disabled])').first();
  await chip.click();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("cart-drawer")).toBeVisible();
}

export async function fillAddressForm(page: Page) {
  const form = page.getByTestId("address-form");
  await form.getByLabel("Full name").fill("Asha Rao");
  await form.getByLabel("Mobile number").fill("9876543210");
  await form.getByLabel("House, flat, street").fill("12 MG Road");
  await form.getByLabel("City").fill("Bengaluru");
  await form.getByLabel("State").selectOption("Karnataka");
  await form.getByLabel("PIN code").fill("560001");
  await form.getByRole("button", { name: "Save address" }).click();
}

export async function checkoutWithMockPayment(page: Page, outcome: "succeed" | "fail" = "succeed"): Promise<string> {
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-page")).toBeVisible();
  if ((await page.getByTestId("address-option").count()) === 0) await fillAddressForm(page);
  await expect(page.getByTestId("address-option").first()).toBeVisible();
  await page.getByTestId("pay-button").click();
  await expect(page).toHaveURL(/\/checkout\/mock-pay\//);
  await page.getByTestId(outcome === "succeed" ? "mock-pay-succeed" : "mock-pay-fail").click();
  await expect(page).toHaveURL(/\/orders\/ORD-\d+\/success/);
  return page.url().match(/ORD-\d+/)![0];
}

export async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

/** /customize → first blank → editor ready → first in-stock size. */
export async function openStudio(page: Page) {
  await page.goto("/customize");
  await expect(page.getByTestId("customize-page")).toBeVisible();
  await page.getByTestId("studio-product-card").first().click();
  await expect(page.getByTestId("studio-page")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await page.getByTestId("studio-tab-product").click();
  await page.locator('[data-testid="studio-size"]:not([disabled])').first().click();
}

export async function addTextToDesign(page: Page, text: string) {
  await page.getByTestId("studio-tab-text").click();
  await page.getByTestId("text-input").fill(text);
  await page.getByTestId("add-text").click();
  await expect(page.getByTestId("studio-page")).toHaveAttribute("data-object-count", /^[1-9]/);
}

/** Uploads a 1200 × 1600 PNG drawn in the page. */
export async function uploadArtwork(page: Page) {
  const bytes = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 1600;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#e11d48";
    ctx.fillRect(100, 100, 1000, 1400);
    const blob: Blob = await new Promise((resolve) => c.toBlob((b) => resolve(b!), "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.getByTestId("studio-tab-upload").click();
  await page.getByTestId("upload-input").setInputFiles({ name: "art.png", mimeType: "image/png", buffer: Buffer.from(bytes) });
  await expect(page.getByTestId("studio-page")).toHaveAttribute("data-object-count", /^[1-9]/, { timeout: 20_000 });
}

/** A separate browser context signed in as the seeded admin, on /admin. */
export async function openAdminPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3001" });
  const page = await ctx.newPage();
  await login(page, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
  // Leave /login before navigating, or we race the session cookie.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  await page.goto("/admin");
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
  return page;
}

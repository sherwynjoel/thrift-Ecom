import { expect, type Page } from "@playwright/test";

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

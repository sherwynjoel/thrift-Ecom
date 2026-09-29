import { expect, test } from "@playwright/test";
import { addFirstProductToBag } from "./helpers";

test("size is required, then adding opens the drawer and persists across reload", async ({ page }) => {
  await page.goto("/collections/oversized-tees");
  await page.getByTestId("product-card").first().getByRole("link").first().click();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByText(/pick a size/i)).toBeVisible();
  await expect(page.getByTestId("cart-drawer")).toBeHidden();

  const chip = page.locator('[data-testid="size-chip"]:not([disabled])').first();
  await chip.click();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("cart-drawer")).toBeVisible();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-count")).toHaveText("1");

  await page.reload();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await page.getByRole("button", { name: /increase quantity/i }).click();
  await expect(page.getByTestId("cart-line-qty")).toHaveText("2");
  await page.getByRole("button", { name: /^remove/i }).click();
  await expect(page.getByTestId("cart-empty")).toBeVisible();
});

test("color swatch switches the gallery", async ({ page }) => {
  await page.goto("/products/static-noise-oversized-tee");
  const first = await page.getByTestId("gallery").locator("img").first().getAttribute("src");
  await page.getByTestId("color-swatch").nth(1).click();
  await expect.poll(async () => page.getByTestId("gallery").locator("img").first().getAttribute("src")).not.toBe(first);
});

test("checkout placeholder shows the bag summary", async ({ page }) => {
  await addFirstProductToBag(page);
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-placeholder")).toBeVisible();
  const itemsRow = page.locator("dl > div").filter({ hasText: "Items" });
  await expect(itemsRow.locator("dd")).not.toHaveText("0");
});

test("clicking checkout in the drawer navigates and closes the drawer", async ({ page }) => {
  await addFirstProductToBag(page);
  await page.getByTestId("cart-drawer").getByRole("button", { name: /^checkout$/i }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.getByTestId("cart-drawer")).toBeHidden();
});

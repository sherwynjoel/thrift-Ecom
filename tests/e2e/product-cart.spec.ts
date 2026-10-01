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

test("colour and size radio groups are one tab stop with arrow-key selection", async ({ page }) => {
  await page.goto("/products/static-noise-oversized-tee");
  const colors = page.getByRole("radiogroup", { name: "Color" }).getByRole("radio");
  await expect(colors.first()).toHaveAttribute("aria-checked", "true");
  await expect(colors.nth(1)).toHaveAttribute("tabindex", "-1");
  await colors.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(colors.nth(1)).toBeFocused();
  await expect(colors.nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(colors.nth(1)).toHaveAttribute("tabindex", "0");

  const sizes = page.getByRole("radiogroup", { name: "Size" }).locator('[role="radio"]:not([disabled])');
  await expect(sizes.first()).toHaveAttribute("tabindex", "0");
  await sizes.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(sizes.nth(1)).toBeFocused();
  await expect(sizes.nth(1)).toHaveAttribute("aria-checked", "true");
});

test("checkout asks guests to log in and keeps the destination", async ({ page }) => {
  await addFirstProductToBag(page);
  await page.goto("/checkout");
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/);
});

test("clicking checkout in the drawer navigates and closes the drawer", async ({ page }) => {
  await addFirstProductToBag(page);
  await page.getByTestId("cart-drawer").getByRole("link", { name: /^checkout$/i }).click();
  await expect(page).toHaveURL(/(\/checkout|next=%2Fcheckout)/);
  await expect(page.getByTestId("cart-drawer")).toBeHidden();
});

import { expect, test } from "@playwright/test";
import { addFirstProductToBag, fillAddressForm, hasNoHorizontalScroll, register, uniqueEmail } from "./helpers";

test("mobile checkout at 390×844: no sideways scroll, reachable pay bar, completes with the mock provider", async ({ page }) => {
  test.slow();
  await register(page, uniqueEmail("mobile"));
  await addFirstProductToBag(page);
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-page")).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);

  await fillAddressForm(page);
  await expect(page.getByTestId("address-option")).toHaveCount(1);
  const pay = page.getByTestId("pay-button");
  await expect(pay).toBeInViewport();
  expect((await pay.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await hasNoHorizontalScroll(page)).toBe(true);

  await pay.click();
  await expect(page).toHaveURL(/\/checkout\/mock-pay\//);
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await page.getByTestId("mock-pay-succeed").click();
  await expect(page.getByTestId("order-success")).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);

  // Base UI's Button renders this <a> with role="button", so match the anchor by its href and text.
  await page.locator('a[href^="/account/orders/"]', { hasText: "View order" }).click();
  await expect(page.getByTestId("order-stepper")).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});

import { expect, test } from "@playwright/test";

test("search finds and misses", async ({ page }) => {
  await page.goto("/search?q=tee");
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  await page.goto("/search?q=zzzz-nothing");
  await expect(page.getByTestId("empty-grid")).toBeVisible();
});

test("static pages and 404", async ({ page }) => {
  for (const slug of ["shipping", "returns", "about", "contact", "privacy", "terms"]) {
    await page.goto(`/pages/${slug}`);
    await expect(page.getByTestId("static-page").getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto("/customize");
  await expect(page.getByTestId("customize-page")).toBeVisible();
  const res = await page.goto("/pages/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toBeVisible();
});

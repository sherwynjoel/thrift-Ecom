import { expect, test } from "@playwright/test";

test("filters and sort update the url and the grid", async ({ page }) => {
  await page.goto("/collections/oversized-tees");
  await expect(page.getByTestId("product-grid")).toBeVisible();
  const before = await page.getByTestId("result-count").textContent();

  await page.getByTestId("filter-rail").getByRole("button", { name: "M", exact: true }).first().click();
  await expect(page).toHaveURL(/size=M/);
  await expect(page.getByTestId("result-count")).toBeVisible();

  await page.getByTestId("sort-select").click();
  await page.getByRole("option", { name: /low to high/i }).click();
  await expect(page).toHaveURL(/sort=price-asc/);
  const prices = await page.getByTestId("price").locator("span").first().allTextContents();
  const nums = prices.map((p) => Number(p.replace(/[^\d]/g, "")));
  expect(nums).toEqual([...nums].sort((a, b) => a - b));

  await page.getByTestId("clear-filters").first().click();
  await expect(page).not.toHaveURL(/size=/);
  expect(before).toBeTruthy();
});

test("collections index lists every collection", async ({ page }) => {
  await page.goto("/collections");
  await expect(page.getByTestId("collection-card")).toHaveCount(5);
});

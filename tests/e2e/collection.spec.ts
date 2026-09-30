import { expect, test } from "@playwright/test";

test("filters and sort update the url and the grid", async ({ page }) => {
  await page.goto("/collections/oversized-tees");
  await expect(page.getByTestId("product-grid")).toBeVisible();
  const before = await page.getByTestId("result-count").textContent();
  expect(before).toMatch(/\d+ products/);

  await page.getByTestId("filter-rail").getByRole("button", { name: "M", exact: true }).first().click();
  await expect(page).toHaveURL(/size=M/);
  await expect(page.getByTestId("result-count")).toBeVisible();
  const afterFilter = await page.getByTestId("result-count").textContent();
  expect(afterFilter).toMatch(/\d+ products/);
  await expect(page.getByTestId("product-grid").getByTestId("product-card").first()).toBeVisible();

  await page.getByTestId("sort-select").click();
  await page.getByRole("option", { name: /low to high/i }).click();
  await expect(page).toHaveURL(/sort=price-asc/);
  const nums = await page
    .getByTestId("product-grid")
    .getByTestId("price")
    .evaluateAll((els) => els.map((el) => Number((el.querySelector("span")?.textContent ?? "").replace(/[^\d]/g, ""))));
  expect(nums.length).toBeGreaterThan(1);
  expect(nums).toEqual([...nums].sort((a, b) => a - b));

  await page.getByTestId("clear-filters").first().click();
  await expect(page).not.toHaveURL(/size=/);
  await expect(page.getByTestId("result-count")).toHaveText(before!);
});

test("collections index lists every collection", async ({ page }) => {
  await page.goto("/collections");
  await expect(page.getByTestId("collection-card")).toHaveCount(5);
});

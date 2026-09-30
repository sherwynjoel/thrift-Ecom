import { expect, test } from "@playwright/test";

test("home renders hero, ticker, collections, and drops", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/wear/i);
  await expect(page.getByTestId("ticker")).toBeVisible();
  // The section also renders a "View all" CTA link (href="/collections") alongside the 3
  // collection cards (href="/collections/<slug>"), so scope to the card links specifically.
  await expect(page.getByTestId("featured-collections").locator('a[href^="/collections/"]')).toHaveCount(3);
  await page.getByTestId("new-drops").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("new-drops").getByTestId("product-card").first()).toBeVisible();
  await expect(page.getByTestId("customize-teaser")).toBeVisible();
  await expect(page.getByTestId("site-footer")).toBeVisible();
});

test("hero CTA goes to new drops", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("hero-cta").click();
  // Client navigation waits for the route to (re)compile in the shared dev server, which can
  // take >10s late in a full run once the dev server has evicted it.
  await expect(page).toHaveURL(/\/collections\/new-drops/, { timeout: 30_000 });
});

test("home has no hydration errors", async ({ page }) => {
  const messages: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") messages.push(msg.text());
  });
  page.on("pageerror", (err) => {
    messages.push(err.message);
  });
  await page.goto("/");
  await expect(page.getByTestId("hero")).toBeVisible();
  const hydrationErrors = messages.filter((m) => /hydrat/i.test(m));
  expect(hydrationErrors).toEqual([]);
});

import { expect, test, type Browser, type Page } from "@playwright/test";
import { addFirstProductToBag, checkoutWithMockPayment, login, register, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function adminPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

async function confirmDelete(page: Page, buttonName: RegExp) {
  page.once("dialog", (d) => d.accept());   // DeleteButton may use window.confirm …
  await page.getByRole("button", { name: buttonName }).first().click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: /delete/i });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();   // … or a confirmation dialog
}

test("wishlist: guests are asked to log in; customers save from a card and remove from the wishlist page", async ({ page }) => {
  await page.goto("/collections/new-drops");
  await page.getByTestId("product-card").first().getByTestId("wishlist-button").click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcollections%2Fnew-drops/);

  await register(page, uniqueEmail("wish"));
  await page.goto("/collections/new-drops");
  const card = page.getByTestId("product-card").first();
  const name = (await card.getByRole("heading").textContent())!.trim();
  const heart = card.getByTestId("wishlist-button");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");

  await page.goto("/account/wishlist");
  const saved = page.getByTestId("wishlist-page").getByTestId("product-card").filter({ hasText: name });
  await expect(saved).toBeVisible();
  await saved.getByTestId("wishlist-button").click();
  await expect(saved).toHaveCount(0);
});

test.describe("admin-driven growth features", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "ADMIN_EMAIL/ADMIN_PASSWORD must be set in .env");

  test("a delivered customer reviews the product; it shows on the product page and in moderation", async ({ page, browser }) => {
    test.slow();
    const title = `Great fit ${Date.now()}`;
    await register(page, uniqueEmail("review"), "Asha Rao");
    await addFirstProductToBag(page);
    const productPath = new URL(page.url()).pathname;
    const number = await checkoutWithMockPayment(page);

    const admin = await adminPage(browser);
    await admin.goto(`/admin/orders?q=${encodeURIComponent(number)}`);
    await admin.getByTestId("order-row").filter({ hasText: number }).getByRole("link", { name: number }).click();
    await admin.getByLabel("Carrier").selectOption("delhivery");
    await admin.getByLabel("Tracking number").fill("E2EREVIEW1");
    await admin.getByRole("button", { name: "Save & mark shipped" }).click();
    await expect(admin.getByTestId("order-status").first()).toHaveText(/shipped/i);
    await admin.getByTestId("next-action").click();
    await expect(admin.getByTestId("order-status").first()).toHaveText(/delivered/i);

    await page.goto(`${productPath}#write-review`);
    const form = page.getByTestId("review-form");
    await form.getByRole("radio", { name: "5 stars" }).check({ force: true });
    await form.getByLabel("Title").fill(title);
    await form.getByLabel("Your review").fill("Heavy cotton, and the print is still sharp after three washes.");
    await form.getByRole("button", { name: "Post review" }).click();

    // Auto-approval may be switched off in this database: approve it in admin if it is waiting.
    await admin.goto("/admin/reviews?status=PENDING");
    const pending = admin.getByTestId("review-card").filter({ hasText: title });
    if (await pending.count()) {
      await pending.getByRole("button", { name: "Approve" }).click();
      await expect(pending).toHaveCount(0);
    }
    await admin.goto("/admin/reviews?status=APPROVED");
    await expect(admin.getByTestId("review-card").filter({ hasText: title })).toBeVisible();
    await admin.context().close();

    await page.goto(productPath);
    await expect(page.getByTestId("review").filter({ hasText: title })).toBeVisible();
    await expect(page.getByTestId("rating-summary")).toBeVisible();
    await expect(page.getByText("Thanks for reviewing this tee.")).toBeVisible();
  });

  test("the announcement bar and an admin ticker line show on the storefront", async ({ page, browser }) => {
    test.slow();
    const text = `E2E sale ${Date.now()}`;
    const admin = await adminPage(browser);
    await admin.goto("/admin/settings");
    const annText = admin.getByLabel("Announcement text");
    const annLink = admin.getByLabel("Announcement link");
    const previous = { text: await annText.inputValue(), link: await annLink.inputValue() };
    try {
      await annText.fill(text);
      await annLink.fill("/collections/new-drops");
      await admin.getByRole("button", { name: "Save settings" }).click();
      await expect(admin.getByText(/saved/i).first()).toBeVisible();
      await page.goto("/");
      await expect(page.getByTestId("announcement-bar")).toContainText(text);
      await page.getByTestId("announcement-bar").getByRole("link").click();
      await expect(page).toHaveURL(/\/collections\/new-drops/);

      await admin.goto("/admin/banners/new");
      const form = admin.getByTestId("banner-form");
      await form.getByLabel("Ticker line (text)").check();
      await form.getByLabel("Title").fill(text);
      await form.getByLabel("Show on the site").check();
      await form.getByRole("button", { name: "Save banner" }).click();
      // The form itself lives at /admin/banners/new, so wait for the saved banner's own URL.
      await expect(admin).toHaveURL(/\/admin\/banners\/(?!new$)[^/]+$/);
      await page.goto("/");
      await expect(page.getByTestId("ticker")).toContainText(text);
      await confirmDelete(admin, /delete banner/i);
      await expect(admin).toHaveURL(/\/admin\/banners$/);
    } finally {
      await admin.goto("/admin/settings");
      await admin.getByLabel("Announcement text").fill(previous.text);
      await admin.getByLabel("Announcement link").fill(previous.link);
      await admin.getByRole("button", { name: "Save settings" }).click();
      await admin.context().close();
    }
  });
});

import { expect, test } from "@playwright/test";
import { addTextToDesign, checkoutWithMockPayment, openAdminPage, openStudio, register, uniqueEmail, uploadArtwork } from "./helpers";

test.describe("design studio and print queue", () => {
  test.skip(!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD, "ADMIN_EMAIL/ADMIN_PASSWORD must be set in .env");

  test("customer designs front and back, pays, and the admin prints it", async ({ page, browser }) => {
    test.slow();
    await register(page, uniqueEmail("studio"), "Asha Rao");
    await openStudio(page);
    const blankPrice = await page.getByTestId("studio-price").innerText();

    await addTextToDesign(page, "HELLO");
    await page.getByTestId("studio-side-back").click();
    await expect(page.getByTestId("studio-page")).toHaveAttribute("data-object-count", "0");
    await uploadArtwork(page);
    await page.getByTestId("studio-tab-layers").click();
    await expect(page.getByTestId("layer-item")).toHaveCount(1);
    await expect(page.getByTestId("studio-price")).not.toHaveText(blankPrice); // back print fee added (seed default ₹149)

    await page.getByTestId("rights-checkbox").check();
    await page.getByTestId("studio-add-to-cart").click();
    const drawer = page.getByTestId("cart-drawer");
    await expect(drawer).toBeVisible({ timeout: 45_000 });
    const line = drawer.getByTestId("cart-line").filter({ has: page.getByTestId("cart-custom-badge") });
    await expect(line).toHaveCount(1);
    await expect(line.getByRole("img").first()).toHaveAttribute("src", /designs/);
    await expect(line.getByTestId("cart-edit-design")).toHaveAttribute("href", /\/customize\/[^?]+\?design=/);

    const number = await checkoutWithMockPayment(page);

    // The order page shows the front preview as the line image and the back as the only extra thumbnail.
    await page.goto(`/account/orders/${number}`);
    await expect(page.getByTestId("custom-print-thumbs").getByRole("img")).toHaveCount(1);
    await expect(page.getByTestId("custom-print-thumbs").getByRole("img")).toHaveAttribute("alt", /^Back/);

    const admin = await openAdminPage(browser);
    await expect(admin.getByTestId("print-queue-badge")).toBeVisible();
    await admin.goto("/admin/print-queue");
    const card = admin.getByTestId("print-queue-item").filter({ hasText: number });
    await expect(card).toHaveCount(1);
    const href = await card.getByTestId("print-download-front").getAttribute("href");
    const file = await admin.request.get(href!);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toBe("image/png");
    await card.getByTestId("mark-printed").click();
    await expect(card).toHaveCount(0);

    await admin.goto(`/admin/orders?q=${encodeURIComponent(number)}`);
    await admin.getByTestId("order-row").filter({ hasText: number }).getByRole("link", { name: number }).click();
    await expect(admin.getByTestId("admin-order")).toBeVisible();
    await expect(admin.getByTestId("order-status").first()).toHaveText(/processing/i);
    await admin.context().close();
  });
});

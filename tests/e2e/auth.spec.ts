import { expect, test } from "@playwright/test";
import { addFirstProductToBag, login, register, uniqueEmail } from "./helpers";

test("register, sign out, log in, wrong password", async ({ page }) => {
  const email = uniqueEmail();
  await register(page, email);
  await page.goto("/account");
  await expect(page.getByTestId("account-page")).toBeVisible();
  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("account-link")).toHaveAttribute("href", "/login");

  await login(page, email, "wrong-password");
  await expect(page.getByTestId("form-error")).toBeVisible();

  await login(page, email);
  await expect(page.getByTestId("account-link")).toHaveAttribute("href", "/account");
});

test("guest bag survives login", async ({ page }) => {
  await addFirstProductToBag(page);
  await page.keyboard.press("Escape");
  const email = uniqueEmail("merge");
  await register(page, email);
  await expect(page.getByTestId("cart-count")).toHaveText("1");
});

test("profile name update", async ({ page }) => {
  await register(page, uniqueEmail("profile"));
  await page.goto("/account");
  await page.getByRole("tab", { name: /profile/i }).click();
  await page.getByTestId("profile-form").getByLabel("Name").fill("Renamed Tester");
  await page.getByTestId("profile-form").getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByTestId("profile-saved")).toBeVisible();
});

test("customer cannot open admin", async ({ page }) => {
  await register(page, uniqueEmail("cust"));
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/admin account/i)).toBeVisible();
});

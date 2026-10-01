import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { addFirstProductToBag, checkoutWithMockPayment, login, register, uniqueEmail } from "../e2e/helpers";
import {
  ADMIN_ROUTES, CUSTOMER_ROUTES, PUBLIC_ROUTES, discoverAdminRoutes, discoverStorefrontRoutes, horizontalOverflow, settle, smallTapTargets, type AuditRoute,
} from "../e2e/routes";

type Finding = { route: string; status: number | null; overflow: Awaited<ReturnType<typeof horizontalOverflow>>; smallTargets: string[] };

async function capture(page: Page, routes: AuditRoute[], group: string): Promise<Finding[]> {
  const dir = `.audit/mobile/${test.info().project.name}`;
  mkdirSync(dir, { recursive: true });
  const findings: Finding[] = [];
  for (const r of routes) {
    const res = await page.goto(r.path);
    await settle(page);
    await page.screenshot({ path: `${dir}/${group}-${r.name}.png`, fullPage: true, animations: "disabled" });
    findings.push({ route: r.path, status: res?.status() ?? null, overflow: await horizontalOverflow(page), smallTargets: await smallTapTargets(page) });
  }
  return findings;
}

test("capture every page at this viewport", async ({ page, browser }) => {
  const report: Record<string, Finding[]> = {};
  report.public = await capture(page, [...PUBLIC_ROUTES, ...(await discoverStorefrontRoutes(page))], "public");

  await register(page, uniqueEmail("audit"));
  await addFirstProductToBag(page);
  report.customer = await capture(page, CUSTOMER_ROUTES, "customer");
  const order = await checkoutWithMockPayment(page);
  report.customer.push(...(await capture(page, [
    { name: "order-success", path: new URL(page.url()).pathname },
    { name: "account-order", path: `/account/orders/${order}` },
  ], "customer")));

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const ctx = await browser.newContext({ ...test.info().project.use });
    const admin = await ctx.newPage();
    await login(admin, email, password);
    await admin.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
    await expect(admin).not.toHaveURL(/\/login/);
    report.admin = await capture(admin, [...ADMIN_ROUTES, ...(await discoverAdminRoutes(admin))], "admin");
    await ctx.close();
  }
  writeFileSync(`.audit/mobile/${test.info().project.name}/report.json`, JSON.stringify(report, null, 2));
});

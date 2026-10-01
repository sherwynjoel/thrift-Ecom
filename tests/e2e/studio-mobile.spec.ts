import { expect, test } from "@playwright/test";
import { addTextToDesign, hasNoHorizontalScroll, openStudio } from "./helpers";

test("studio at 390×844: bottom-sheet tools, 44 px targets, guest adds a custom tee", async ({ page }) => {
  test.slow();
  await openStudio(page);
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await expect(page.getByTestId("studio-sheet")).toBeVisible();
  await expect(page.getByTestId("studio-canvas")).toBeVisible();

  for (const id of ["studio-tab-product", "studio-tab-upload", "studio-tab-text", "studio-tab-layers", "studio-side-front", "studio-side-back", "studio-add-to-cart"]) {
    expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(44);
  }

  await addTextToDesign(page, "HELLO");
  // With the sheet open the edit tools flank the stage in two toolbars; only the visible ones are in the a11y tree.
  for (const name of ["Undo", "Redo", "Duplicate", "Bring forward", "Send backward", "Centre", "Delete"]) {
    const box = await page.getByRole("toolbar").getByRole("button", { name, exact: true }).boundingBox();
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
    expect(box!.width, name).toBeGreaterThanOrEqual(44);
  }
  expect(await hasNoHorizontalScroll(page)).toBe(true);

  // The canvas lets the browser scroll (Fabric's touch-action is baked at construction), yet a one-finger drag on a layer moves it.
  expect(await page.locator("canvas.upper-canvas").evaluate((el) => getComputedStyle(el).touchAction)).not.toBe("none");
  const surface = page.getByTestId("studio-surface");
  const cdp = await page.context().newCDPSession(page);
  // Measured per touch: the stage resizes as the sheet's contents change with the selection.
  const swipe = async (fx: number, fy: number, dx: number) => {
    const box = (await surface.boundingBox())!;
    const from = { x: box.x + box.width * fx, y: box.y + box.height * fy };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
    for (let d = 10; d <= dx; d += 10) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + d, y: from.y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  // Compare deselected stages (a tap on empty stage clears the selection), so only a moved layer changes the pixels.
  const deselectedShot = async () => {
    await swipe(0.5, 0.95, 0);
    await expect(page.getByTestId("object-toolbar").or(page.getByRole("toolbar", { name: "Arrange" })).getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
    return surface.screenshot();
  };
  const before = await deselectedShot();
  await swipe(0.5, 0.48, 60); // the text sits at the print-area centre
  await expect.poll(async () => Buffer.compare(before, await deselectedShot())).not.toBe(0);

  // On a phone the rights checkbox sits in the collapsed sheet's footer.
  await page.getByTestId("studio-sheet-toggle").click();
  await page.getByTestId("rights-checkbox").check();
  await page.getByTestId("studio-add-to-cart").click();
  await expect(page.getByTestId("cart-drawer")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("cart-custom-badge")).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});

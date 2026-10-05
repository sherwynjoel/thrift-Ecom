import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk";

const root = mkdtempSync(join(tmpdir(), "print-queue-"));
const storage = new LocalDiskStorage(root, "/api/uploads");
vi.mock("@/server/adapters/storage", async (orig) => ({ ...(await orig<typeof import("@/server/adapters/storage")>()), getStorage: () => storage }));

import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { createOrderItemRow, createOrderRow, createUser } from "../helpers/fixtures";
import { fakePng } from "../helpers/png";
import { countPrintQueue, getPrintFile, holdItem, listPrintQueue, markItemPrinted, releaseHold } from "@/server/services/print-queue";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

const DAY = 86_400_000;

describe("print queue service", () => {
  beforeEach(resetDb);

  it("lists unprinted custom items of paid and processing orders, oldest paid first", async () => {
    const u = await createUser();
    const older = await createOrderRow(u.id, { status: "PROCESSING", paidAt: new Date(Date.now() - 2 * DAY) });
    const newer = await createOrderRow(u.id, { status: "PAID", paidAt: new Date(Date.now() - DAY) });
    const pending = await createOrderRow(u.id, { status: "PENDING_PAYMENT", paidAt: null });
    const shipped = await createOrderRow(u.id, { status: "SHIPPED" });
    const a = await createOrderItemRow(older.id);
    const b = await createOrderItemRow(newer.id, { printFrontUrl: null, designFrontPreviewUrl: null, printBackUrl: "/api/uploads/designs/print/b.png", designBackPreviewUrl: "/api/uploads/designs/previews/b.png" });
    await createOrderItemRow(newer.id, { printFrontUrl: null, designFrontPreviewUrl: null }); // plain tee
    await createOrderItemRow(newer.id, { printedAt: new Date() });
    await createOrderItemRow(pending.id);
    await createOrderItemRow(shipped.id);
    const q = await listPrintQueue();
    expect(q.map((i) => i.itemId)).toEqual([a.id, b.id]);
    expect(q[1]).toMatchObject({ orderNumber: newer.number, orderStatus: "PAID", hasFrontPrint: false, hasBackPrint: true, backPreviewUrl: "/api/uploads/designs/previews/b.png", customerName: "Asha Rao" });
    expect(await countPrintQueue()).toBe(2);
  });

  it("moves a paid order to processing once every custom item is printed", async () => {
    const o = await createOrderRow((await createUser()).id, { status: "PAID" });
    const a = await createOrderItemRow(o.id);
    const b = await createOrderItemRow(o.id);
    await createOrderItemRow(o.id, { printFrontUrl: null, designFrontPreviewUrl: null }); // plain tee does not block
    expect(await markItemPrinted(a.id, null)).toEqual({ orderMovedToProcessing: false });
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PAID");
    expect(await markItemPrinted(b.id, null)).toEqual({ orderMovedToProcessing: true });
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { events: true } });
    expect(after.status).toBe("PROCESSING");
    expect(after.processingAt).not.toBeNull();
    expect(after.events.map((e) => e.type).sort()).toEqual(["PRINTED", "PRINTED", "STATUS_CHANGED"]);
    await expect(markItemPrinted(b.id, null)).rejects.toBeInstanceOf(ConflictError);
    expect(await countPrintQueue()).toBe(0);
  });

  it("moves the order exactly once when its last two items are marked printed at the same time", async () => {
    const o = await createOrderRow((await createUser()).id, { status: "PAID" });
    const a = await createOrderItemRow(o.id);
    const b = await createOrderItemRow(o.id);
    const results = await Promise.all([markItemPrinted(a.id, null), markItemPrinted(b.id, null)]);
    expect(results.filter((r) => r.orderMovedToProcessing)).toHaveLength(1);
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { events: true } });
    expect(after.status).toBe("PROCESSING");
    expect(after.events.filter((e) => e.type === "STATUS_CHANGED")).toHaveLength(1);
  });

  it("leaves orders that are already processing where they are", async () => {
    const o = await createOrderRow((await createUser()).id, { status: "PROCESSING" });
    const a = await createOrderItemRow(o.id);
    expect(await markItemPrinted(a.id, null)).toEqual({ orderMovedToProcessing: false });
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PROCESSING");
  });

  it("holds and releases an item", async () => {
    const o = await createOrderRow((await createUser()).id, { status: "PAID" });
    const a = await createOrderItemRow(o.id);
    await expect(holdItem(a.id, " ", null)).rejects.toBeInstanceOf(ValidationError);
    await holdItem(a.id, "Artwork may be copyrighted", null);
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ holdNote: "Artwork may be copyrighted" });
    const flagged = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { events: true } });
    expect(flagged.needsAttention).toBe(true);
    expect(flagged.events.find((e) => e.type === "ATTENTION")?.message).toContain("Artwork may be copyrighted");
    expect((await listPrintQueue())[0]).toMatchObject({ itemId: a.id, holdNote: "Artwork may be copyrighted" });
    await expect(holdItem(a.id, "Second hold", null)).rejects.toBeInstanceOf(ConflictError);
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ holdNote: "Artwork may be copyrighted" });
    await expect(markItemPrinted(a.id, null)).rejects.toBeInstanceOf(ConflictError);
    await releaseHold(a.id, null);
    await expect(releaseHold(a.id, null)).rejects.toBeInstanceOf(ConflictError);
    expect(await markItemPrinted(a.id, null)).toEqual({ orderMovedToProcessing: true });
  });

  it("records a hold as a note when the order is already flagged for something else", async () => {
    const o = await createOrderRow((await createUser()).id, { status: "PAID", needsAttention: true });
    const a = await createOrderItemRow(o.id);
    await holdItem(a.id, "Low resolution logo", null);
    const events = await db.orderEvent.findMany({ where: { orderId: o.id } });
    expect(events.map((e) => [e.type, e.message.includes("Low resolution logo")])).toEqual([["NOTE", true]]);
  });

  it("refuses plain items and orders outside the queue", async () => {
    const u = await createUser();
    const plain = await createOrderItemRow((await createOrderRow(u.id)).id, { printFrontUrl: null, designFrontPreviewUrl: null });
    await expect(markItemPrinted(plain.id, null)).rejects.toBeInstanceOf(NotFoundError);
    const shipped = await createOrderItemRow((await createOrderRow(u.id, { status: "SHIPPED" })).id);
    await expect(markItemPrinted(shipped.id, null)).rejects.toBeInstanceOf(ConflictError);
    await expect(holdItem(shipped.id, "Too late", null)).rejects.toBeInstanceOf(ConflictError);
  });

  it("streams print files with a helpful name", async () => {
    await storage.put("designs/print/x.png", fakePng(3600, 4800), "image/png");
    const o = await createOrderRow((await createUser()).id, { number: "ORD-2001" });
    const it = await createOrderItemRow(o.id, { printFrontUrl: "/api/uploads/designs/print/x.png", sku: "BLK-M" });
    const file = await getPrintFile(it.id, "front");
    expect(file.filename).toBe("ORD-2001-BLK-M-front.png");
    expect(file.bytes.byteLength).toBe(40);
    await expect(getPrintFile(it.id, "back")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("never serves a file outside the print folder", async () => {
    await storage.put("designs/assets/secret.png", fakePng(10, 10), "image/png");
    const o = await createOrderRow((await createUser()).id);
    const it = await createOrderItemRow(o.id, { printFrontUrl: "/api/uploads/designs/assets/secret.png", printBackUrl: "/api/uploads/designs/print/../assets/secret.png" });
    await expect(getPrintFile(it.id, "front")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPrintFile(it.id, "back")).rejects.toBeInstanceOf(NotFoundError);
  });
});

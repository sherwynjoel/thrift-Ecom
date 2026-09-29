import { describe, expect, it } from "vitest";
import { canCancel, fulfilmentRank, isPaidStatus, nextFulfilmentStatus, ORDER_STATUS_LABEL } from "@/lib/order-status";

describe("order status rules", () => {
  it("knows which statuses count as paid", () => {
    expect(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].every((s) => isPaidStatus(s as never))).toBe(true);
    expect(["PENDING_PAYMENT", "CANCELLED", "EXPIRED", "REFUNDED"].some((s) => isPaidStatus(s as never))).toBe(false);
  });

  it("allows cancelling only before shipping", () => {
    expect(canCancel("PENDING_PAYMENT")).toBe(true);
    expect(canCancel("PAID")).toBe(true);
    expect(canCancel("PROCESSING")).toBe(true);
    expect(canCancel("SHIPPED")).toBe(false);
    expect(canCancel("DELIVERED")).toBe(false);
    expect(canCancel("EXPIRED")).toBe(false);
  });

  it("walks the fulfilment chain", () => {
    expect(nextFulfilmentStatus("PAID")).toBe("PROCESSING");
    expect(nextFulfilmentStatus("PROCESSING")).toBe("SHIPPED");
    expect(nextFulfilmentStatus("SHIPPED")).toBe("DELIVERED");
    expect(nextFulfilmentStatus("DELIVERED")).toBeNull();
    expect(nextFulfilmentStatus("PENDING_PAYMENT")).toBeNull();
    expect(fulfilmentRank("SHIPPED")).toBe(2);
    expect(fulfilmentRank("CANCELLED")).toBe(-1);
  });

  it("labels every status", () => {
    expect(ORDER_STATUS_LABEL.PENDING_PAYMENT).toBe("Awaiting payment");
    expect(Object.keys(ORDER_STATUS_LABEL)).toHaveLength(8);
  });
});

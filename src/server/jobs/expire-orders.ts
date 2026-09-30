import { expireStaleOrders } from "@/server/services/orders";

export async function runExpireOrders(now: Date = new Date()): Promise<{ expired: number }> {
  return { expired: await expireStaleOrders(now) };
}

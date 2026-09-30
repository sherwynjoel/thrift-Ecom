import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/fixtures";
import { createAddress, deleteAddress, listAddresses, MAX_ADDRESSES, setDefaultAddress, updateAddress } from "@/server/services/addresses";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

const addr = (over: Record<string, unknown> = {}) => ({
  fullName: "Asha Rao", phone: "+91 98765-43210", line1: "12 MG Road", line2: "", landmark: "",
  city: "Bengaluru", state: "Karnataka", pincode: "560001", isDefault: false, ...over,
});

describe("addresses service", () => {
  beforeEach(resetDb);

  it("normalises input and makes the first address the default", async () => {
    const u = await createUser();
    const a = await createAddress(u.id, addr());
    expect(a).toMatchObject({ phone: "9876543210", line2: null, landmark: null, isDefault: true });
    const b = await createAddress(u.id, addr({ fullName: "Ravi" }));
    expect(b.isDefault).toBe(false);
    const c = await createAddress(u.id, addr({ fullName: "Meera", isDefault: true }));
    const list = await listAddresses(u.id);
    expect(list[0].id).toBe(c.id);
    expect(list.filter((x) => x.isDefault)).toHaveLength(1);
  });

  it("validates phone, pincode and state", async () => {
    const u = await createUser();
    const err = await createAddress(u.id, addr({ phone: "12345", pincode: "060001", state: "Bombay" })).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys(err.details)).toEqual(expect.arrayContaining(["phone", "pincode", "state"]));
  });

  it("caps each user at ten addresses", async () => {
    const u = await createUser();
    for (let i = 0; i < MAX_ADDRESSES; i++) await createAddress(u.id, addr({ fullName: `Name ${i}` }));
    await expect(createAddress(u.id, addr())).rejects.toBeInstanceOf(ConflictError);
  });

  it("serializes concurrent creates so exactly one address ends up default", async () => {
    const u = await createUser();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => createAddress(u.id, addr({ fullName: `Name ${i}` }))),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const list = await listAddresses(u.id);
    expect(list).toHaveLength(5);
    expect(list.filter((x) => x.isDefault)).toHaveLength(1);
  });

  it("serializes concurrent creates so the ten-address cap is never exceeded", async () => {
    const u = await createUser();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => createAddress(u.id, addr({ fullName: `Name ${i}` }))),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(MAX_ADDRESSES);
    expect(rejected).toHaveLength(2);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(ConflictError);
    const list = await listAddresses(u.id);
    expect(list).toHaveLength(MAX_ADDRESSES);
    expect(list.filter((x) => x.isDefault)).toHaveLength(1);
  });

  it("keeps addresses private to their owner", async () => {
    const u = await createUser();
    const other = await createUser();
    const a = await createAddress(u.id, addr());
    expect(await listAddresses(other.id)).toEqual([]);
    await expect(updateAddress(other.id, a.id, addr())).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteAddress(other.id, a.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("switches the default and never leaves none", async () => {
    const u = await createUser();
    const a = await createAddress(u.id, addr());
    const b = await createAddress(u.id, addr({ fullName: "Ravi" }));
    expect((await updateAddress(u.id, a.id, addr({ isDefault: false }))).isDefault).toBe(true);
    const list = await setDefaultAddress(u.id, b.id);
    expect(list.find((x) => x.isDefault)?.id).toBe(b.id);
    await deleteAddress(u.id, b.id);
    expect((await listAddresses(u.id))[0]).toMatchObject({ id: a.id, isDefault: true });
    await deleteAddress(u.id, a.id);
    expect(await listAddresses(u.id)).toEqual([]);
  });
});

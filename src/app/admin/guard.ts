import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/admin-guard";

export async function requireAdminPage(): Promise<{ userId: string }> {
  const result = await requireAdmin().then(
    (r) => ({ ok: true as const, r }),
    () => ({ ok: false as const }),
  );
  if (!result.ok) redirect("/login?next=%2Fadmin");
  return result.r;
}

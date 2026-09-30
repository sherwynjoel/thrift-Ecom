import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/admin-guard";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";

export async function requireAdminPage(): Promise<{ userId: string }> {
  try {
    return await requireAdmin();
  } catch (err) {
    // Only "not logged in" / "not an admin" send the visitor to /login. Anything else (a DB outage, a
    // thrown bug) is a real error and should surface as one via admin/error.tsx, not look like a login
    // problem.
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) redirect("/login?next=%2Fadmin");
    throw err;
  }
}

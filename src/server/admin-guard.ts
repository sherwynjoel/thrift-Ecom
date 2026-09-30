import { auth } from "@/server/auth";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";
import { getUserById } from "@/server/services/auth";

/** Re-checks the role in the database on every admin request; the JWT role alone is not trusted. */
export async function requireAdmin(): Promise<{ userId: string }> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new UnauthorizedError();
  const user = await getUserById(id);
  if (!user || user.role !== "ADMIN") throw new ForbiddenError("Admins only");
  return { userId: user.id };
}

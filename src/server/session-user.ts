import { auth } from "@/server/auth";
import { UnauthorizedError } from "@/server/errors";

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user.id;
}

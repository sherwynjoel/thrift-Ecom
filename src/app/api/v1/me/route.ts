import { handle, ok, requireApiUser } from "@/server/api";

export const GET = handle(async (req) => ok(await requireApiUser(req)));

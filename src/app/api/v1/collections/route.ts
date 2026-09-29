import { handle, ok } from "@/server/api";
import { listCollections } from "@/server/services/catalog";

export const GET = handle(async () => ok(await listCollections()));

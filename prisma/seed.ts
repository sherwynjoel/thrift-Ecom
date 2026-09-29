import { PrismaClient } from "@prisma/client";
import { join } from "node:path";
import { runSeed } from "../src/server/seed/run-seed";

const db = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set");
  const result = await runSeed(db, { adminEmail, adminPassword, publicDir: join(process.cwd(), "public") });
  console.log("Seeded:", result);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

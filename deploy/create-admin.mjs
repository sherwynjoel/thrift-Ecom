// Creates the store admin, or promotes an existing user to ADMIN and resets its password.
// Runs inside the app container (see deploy/seed-admin.sh):
//   printf '%s\n%s\n' "$EMAIL" "$PASSWORD" | node /opt/tools/create-admin.mjs --stdin
// or with ADMIN_EMAIL / ADMIN_PASSWORD in the environment. APP_DIR (default /app) locates the app's Prisma client,
// so the same script can be tried locally: APP_DIR="$PWD" DATABASE_URL=… node deploy/create-admin.mjs --stdin
import { createRequire } from "node:module";
import { join } from "node:path";
import { hash } from "bcryptjs";

const appRequire = createRequire(join(process.env.APP_DIR ?? "/app", "server.js"));
const { PrismaClient } = appRequire("@prisma/client");

async function readStdinLines() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
}

const fail = (msg) => {
  console.error(`create-admin: ${msg}`);
  process.exit(1);
};

let email = process.env.ADMIN_EMAIL ?? "";
let password = process.env.ADMIN_PASSWORD ?? "";
if (process.argv.includes("--stdin")) [email = "", password = ""] = await readStdinLines();
email = email.trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("enter a valid email address");
if (password.length < 12) fail("the password must be at least 12 characters");
if (password.length > 128) fail("the password must be at most 128 characters");

const db = new PrismaClient();
try {
  const passwordHash = await hash(password, 10);
  const user = await db.user.upsert({
    where: { email },
    update: { role: "ADMIN", passwordHash },
    create: { email, name: "Admin", role: "ADMIN", passwordHash },
    select: { email: true, role: true },
  });
  console.log(`Admin ready: ${user.email} (${user.role}). Sign in at /login, then open /admin.`);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await db.$disconnect();
}

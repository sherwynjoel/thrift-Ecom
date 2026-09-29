import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";
import { registerSchema, updateProfileSchema, changePasswordSchema, passwordSchema } from "@/lib/validation/auth";
import { getEmail } from "@/server/adapters/email";
import { BRAND } from "@/config/brand";

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: "CUSTOMER" | "ADMIN";
}

const RESET_PREFIX = "pwreset:";
const RESET_TTL_MS = 60 * 60 * 1000;

function toPublic(u: { id: string; email: string; name: string | null; image: string | null; role: "CUSTOMER" | "ADMIN" }): PublicUser {
  return { id: u.id, email: u.email, name: u.name, image: u.image, role: u.role };
}

function fieldErrors(err: { flatten(): { fieldErrors: Record<string, string[] | undefined> } }): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(err.flatten().fieldErrors)) if (v?.length) out[k] = v;
  return out;
}

export async function registerUser(input: { name: string; email: string; password: string }): Promise<PublicUser> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const { name, email, password } = parsed.data;
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) throw new ConflictError("An account with this email already exists");
  const passwordHash = await hash(password, 10);
  const user = await db.user.create({ data: { name, email, passwordHash } });
  return toPublic(user);
}

export async function verifyCredentials(email: string, password: string): Promise<PublicUser | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user?.passwordHash) return null;
  const ok = await compare(password, user.passwordHash);
  return ok ? toPublic(user) : null;
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const user = await db.user.findUnique({ where: { id } });
  return user ? toPublic(user) : null;
}

export async function createPasswordResetToken(email: string): Promise<{ token: string; user: PublicUser } | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return null;
  const token = randomBytes(32).toString("base64url");
  const identifier = RESET_PREFIX + user.email;
  await db.verificationToken.deleteMany({ where: { identifier } });
  await db.verificationToken.create({ data: { identifier, token, expires: new Date(Date.now() + RESET_TTL_MS) } });
  return { token, user: toPublic(user) };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) throw new ValidationError({ password: parsed.error.issues.map((i) => i.message) });
  const row = await db.verificationToken.findUnique({ where: { token } });
  if (!row || !row.identifier.startsWith(RESET_PREFIX) || row.expires < new Date()) {
    throw new UnauthorizedError("This reset link is invalid or has expired");
  }
  const email = row.identifier.slice(RESET_PREFIX.length);
  await db.$transaction([
    db.user.update({ where: { email }, data: { passwordHash: await hash(parsed.data, 10) } }),
    db.verificationToken.delete({ where: { identifier_token: { identifier: row.identifier, token } } }),
  ]);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const issued = await createPasswordResetToken(email);
  if (!issued) return;
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${origin}/reset-password?token=${issued.token}`;
  await getEmail().send({
    to: issued.user.email,
    subject: `Reset your ${BRAND.name} password`,
    text: `Reset your password: ${link}\nThis link works once and expires in one hour.`,
    html: `<p>Hi ${issued.user.name ?? "there"},</p><p><a href="${link}">Reset your password</a></p><p>This link works once and expires in one hour. If you did not ask for this, ignore this email.</p>`,
  });
}

export async function updateProfile(userId: string, input: { name: string }): Promise<PublicUser> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const user = await db.user.update({ where: { id: userId }, data: { name: parsed.data.name } });
  return toPublic(user);
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  const parsed = changePasswordSchema.safeParse({ current, next });
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User");
  if (!user.passwordHash || !(await compare(current, user.passwordHash))) {
    throw new UnauthorizedError("Current password is incorrect");
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hash(next, 10) } });
}

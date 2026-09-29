import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/server/db";
import { authConfig } from "@/server/auth.config";
import { verifyCredentials } from "@/server/services/auth";
import { loginSchema } from "@/lib/validation/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await verifyCredentials(parsed.data.email, parsed.data.password);
        return user ? { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role } : null;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "CUSTOMER";
      }
      // Note: `token.id` reads as `unknown` here due to a next-auth@5 beta type-inference quirk
      // when this callback is defined inline inside the NextAuth({...}) call (see task-8-report.md).
      // The runtime value is always a string | undefined; assert it once and reuse.
      const tokenId = token.id as string | undefined;
      if (trigger === "update" && tokenId) {
        const fresh = await db.user.findUnique({ where: { id: tokenId }, select: { role: true, name: true } });
        if (fresh) {
          token.role = fresh.role;
          token.name = fresh.name;
        }
      }
      if (!token.role && tokenId) {
        const fresh = await db.user.findUnique({ where: { id: tokenId }, select: { role: true } });
        token.role = fresh?.role ?? "CUSTOMER";
      }
      return token;
    },
  },
});

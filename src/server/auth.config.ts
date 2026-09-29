import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: googleEnabled
    ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, allowDangerousEmailAccountLinking: true })]
    : [],
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider === "google") return profile?.email_verified === true;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "CUSTOMER";
      }
      return token;
    },
    session({ session, token }) {
      // Note: in this callback's next-auth@5 beta type (an intersection of the jwt- and
      // database-session shapes), a narrowed `token.id`/`token.role` read collapses to `{}`.
      // The runtime value is always a string; assert it once and reuse (see task-8-report.md).
      const tokenId = token.id as string | undefined;
      const tokenRole = token.role as "CUSTOMER" | "ADMIN" | undefined;
      if (tokenId) session.user.id = tokenId;
      session.user.role = tokenRole ?? "CUSTOMER";
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isAdminArea = pathname.startsWith("/admin");
      const isAccountArea = pathname.startsWith("/account");
      if (isAdminArea) return auth?.user?.role === "ADMIN";
      if (isAccountArea) return Boolean(auth?.user);
      return true;
    },
  },
} satisfies NextAuthConfig;

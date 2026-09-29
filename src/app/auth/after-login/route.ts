import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { clearGuestToken, readGuestToken } from "@/server/cart-cookie";
import { mergeGuestCartIntoUser } from "@/server/services/cart";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const session = await auth();
  if (session?.user?.id) {
    const guestToken = await readGuestToken();
    if (guestToken) {
      await mergeGuestCartIntoUser(guestToken, session.user.id);
      await clearGuestToken();
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}

import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { clearGuestToken, readGuestToken } from "@/server/cart-cookie";
import { safeNext } from "@/server/safe-next";
import { mergeGuestCartIntoUser } from "@/server/services/cart";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"), url.origin);
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

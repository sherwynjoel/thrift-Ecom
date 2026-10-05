import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { clearGuestToken, readGuestToken } from "@/server/cart-cookie";
import { siteUrl } from "@/lib/site-url";
import { safeNext } from "@/server/safe-next";
import { mergeGuestCartIntoUser } from "@/server/services/cart";

export async function GET(request: Request) {
  const url = new URL(request.url);
  // Behind the reverse proxy request.url carries the container's own address (http://0.0.0.0:3000), so validate and
  // redirect against the public origin when it is configured; locally the request origin is the public one.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ? new URL(siteUrl()).origin : url.origin;
  const next = safeNext(url.searchParams.get("next"), origin);
  const session = await auth();
  if (session?.user?.id) {
    const guestToken = await readGuestToken();
    if (guestToken) {
      await mergeGuestCartIntoUser(guestToken, session.user.id);
      await clearGuestToken();
    }
  }
  return NextResponse.redirect(new URL(next, origin));
}

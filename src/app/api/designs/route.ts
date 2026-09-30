import { clientIp, handle, ok, resolveApiCartRef, withGuestCookie } from "@/server/api";
import { parseDesignForm } from "@/server/design-form";
import { RateLimitedError, ValidationError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { createDesignAndAddToCart } from "@/server/services/designs";
import { MAX_DESIGN_UPLOAD_BYTES } from "@/lib/studio/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const rl = rateLimit(`designs:${clientIp(req)}`, 20, 10 * 60_000);
  if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_DESIGN_UPLOAD_BYTES + 1024 * 1024) throw new ValidationError({ design: ["This design is too large to upload. Try smaller images."] });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ValidationError({ body: ["Expected multipart form data"] });
  }
  const input = await parseDesignForm(form);
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  const result = await createDesignAndAddToCart(ref, input);
  return withGuestCookie(ok(result, { status: 201 }), newGuestToken);
});

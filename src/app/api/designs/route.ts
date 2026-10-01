import { clientIp, handle, ok, resolveApiCartRef, withGuestCookie } from "@/server/api";
import { parseDesignForm } from "@/server/design-form";
import { RateLimitedError } from "@/server/errors";
import { readLimitedForm } from "@/server/limited-form";
import { rateLimit } from "@/server/rate-limit";
import { createDesignAndAddToCart } from "@/server/services/designs";
import { withUploadGate } from "@/server/upload-gate";
import { MAX_DESIGN_UPLOAD_BYTES } from "@/lib/studio/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Files plus multipart overhead and the two JSON sides. */
const DESIGN_BODY_LIMIT = MAX_DESIGN_UPLOAD_BYTES + 1024 * 1024;
/** productId, variantId, quantity, rightsConfirmed + (json, preview, print) per side. */
const DESIGN_FORM_ENTRIES = 12;

export const POST = handle(async (req) => {
  const rl = rateLimit(`designs:${clientIp(req)}`, 20, 10 * 60_000);
  if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
  const form = await readLimitedForm(req, DESIGN_BODY_LIMIT, DESIGN_FORM_ENTRIES, "This design is too large to upload. Try smaller images.");
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  // Decoding/storing the images is the expensive part; gate that, not the cheap request setup above.
  const result = await withUploadGate(async () => {
    const input = await parseDesignForm(form);
    return createDesignAndAddToCart(ref, input);
  });
  return withGuestCookie(ok(result, { status: 201 }), newGuestToken);
});

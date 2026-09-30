import { clientIp, handle, ok, resolveApiCartRef, withGuestCookie } from "@/server/api";
import { RateLimitedError, ValidationError } from "@/server/errors";
import { readLimitedForm } from "@/server/limited-form";
import { rateLimit } from "@/server/rate-limit";
import { uploadDesignAsset } from "@/server/services/designs";
import { MAX_DESIGN_ASSET_BYTES } from "@/lib/studio/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASSET_BODY_LIMIT = MAX_DESIGN_ASSET_BYTES + 256 * 1024;

export const POST = handle(async (req) => {
  const rl = rateLimit(`design-assets:${clientIp(req)}`, 40, 10 * 60_000);
  if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
  const file = (await readLimitedForm(req, ASSET_BODY_LIMIT, 1, "Images must be under 10 MB")).get("file");
  if (!(file instanceof File) || file.size === 0) throw new ValidationError({ file: ["Choose an image to upload"] });
  // Assets belong to whoever uploaded them (user or guest bag), so only their owner can use them in a design.
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  return withGuestCookie(ok(await uploadDesignAsset(ref, file), { status: 201 }), newGuestToken);
});

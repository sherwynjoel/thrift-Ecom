import { clientIp, handle, ok } from "@/server/api";
import { RateLimitedError, ValidationError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { uploadDesignAsset } from "@/server/services/designs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const rl = rateLimit(`design-assets:${clientIp(req)}`, 40, 10 * 60_000);
  if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    throw new ValidationError({ file: ["Expected multipart form data"] });
  }
  if (!(file instanceof File) || file.size === 0) throw new ValidationError({ file: ["Choose an image to upload"] });
  return ok(await uploadDesignAsset(file), { status: 201 });
});

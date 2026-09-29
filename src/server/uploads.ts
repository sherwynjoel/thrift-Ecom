import { randomUUID } from "node:crypto";
import { ValidationError } from "@/server/errors";
import { getStorage } from "@/server/adapters/storage";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";

export { MAX_UPLOAD_BYTES };

type Detected = { ext: "png" | "jpg" | "webp"; contentType: string };

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  return sig.every((b, i) => bytes[offset + i] === b);
}

export function validateImage(bytes: Uint8Array): Detected {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ValidationError({ file: [`Images must be under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`] });
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", contentType: "image/png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { ext: "jpg", contentType: "image/jpeg" };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { ext: "webp", contentType: "image/webp" };
  throw new ValidationError({ file: ["Only PNG, JPG, and WebP images are allowed"] });
}

export function newUploadKey(prefix: string, ext: string): string {
  return `${prefix}/${randomUUID()}.${ext}`;
}

export async function storeImage(file: File, prefix: string): Promise<{ url: string; key: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { ext, contentType } = validateImage(bytes);
  const key = newUploadKey(prefix, ext);
  const { url } = await getStorage().put(key, bytes, contentType);
  return { url, key };
}

/** Returns the storage key for URLs produced by the active storage adapter; null for anything else (e.g. /seed/*.svg). */
export function uploadKeyFromUrl(url: string): string | null {
  const prefix = getStorage().getPublicUrl("");
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  return key && !key.includes("..") ? key : null;
}

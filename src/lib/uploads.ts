// Client-safe upload limits shared between the browser (pre-flight validation) and the server
// (`@/server/uploads`, `@/server/services/admin-images`). Keep this file free of server-only
// imports (node builtins, storage adapters) so client components can import it directly.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 10;
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const ACCEPTED_IMAGE_LABEL = "PNG, JPG or WebP";

/** Returns a human-readable problem with the file, or null if it passes the same checks the server enforces. */
export function imageFileError(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    return `${file.name}: only ${ACCEPTED_IMAGE_LABEL} images are allowed`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name}: must be under ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`;
  }
  return null;
}

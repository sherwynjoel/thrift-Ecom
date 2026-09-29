import { join } from "node:path";
import { LocalDiskStorage } from "./local-disk";
import { S3Storage } from "./s3";
import type { StorageAdapter } from "./types";

export type { StorageAdapter } from "./types";
export { LocalDiskStorage } from "./local-disk";
export { S3Storage } from "./s3";

export const LOCAL_UPLOAD_ROOT = join(process.cwd(), "storage", "uploads");

let cached: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  if (cached) return cached;
  if (process.env.STORAGE_DRIVER === "s3") {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.AWS_REGION;
    const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
    if (!bucket || !region || !publicBaseUrl) throw new Error("S3_BUCKET, AWS_REGION and S3_PUBLIC_BASE_URL are required when STORAGE_DRIVER=s3");
    cached = new S3Storage({ bucket, region, publicBaseUrl });
  } else {
    cached = new LocalDiskStorage(LOCAL_UPLOAD_ROOT);
  }
  return cached;
}

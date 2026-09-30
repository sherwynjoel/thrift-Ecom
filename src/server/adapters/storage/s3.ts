import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageAdapter } from "./types";

export class S3Storage implements StorageAdapter {
  private readonly client: S3Client;
  constructor(private readonly opts: { bucket: string; region: string; publicBaseUrl: string }) {
    this.client = new S3Client({ region: opts.region });
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<{ url: string }> {
    await this.client.send(new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: bytes, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
    return { url: this.getPublicUrl(key) };
  }

  getPublicUrl(key: string): string {
    return `${this.opts.publicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return res.Body ? await res.Body.transformToByteArray() : null;
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  }
}

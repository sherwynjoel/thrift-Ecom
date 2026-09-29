import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { StorageAdapter } from "./types";

export class LocalDiskStorage implements StorageAdapter {
  constructor(private readonly rootDir: string, private readonly publicBase = "/api/uploads") {}

  private resolveKey(key: string): string {
    const root = resolve(this.rootDir);
    const full = resolve(root, key);
    if (full !== root && !full.startsWith(root + sep)) throw new Error("Invalid storage key");
    return full;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<{ url: string }> {
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, bytes);
    return { url: this.getPublicUrl(key) };
  }

  getPublicUrl(key: string): string {
    return `${this.publicBase}/${key.replace(/^\/+/, "")}`;
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }
}

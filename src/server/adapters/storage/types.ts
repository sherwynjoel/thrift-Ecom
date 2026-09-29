export interface StorageAdapter {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<{ url: string }>;
  getPublicUrl(key: string): string;
  delete(key: string): Promise<void>;
}

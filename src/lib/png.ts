const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = [0x49, 0x48, 0x44, 0x52];

/** Width and height from a PNG's first chunk (IHDR); null if the bytes are not a PNG. Never decodes pixels. */
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 24) return null;
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  if (!IHDR.every((b, i) => bytes[12 + i] === b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

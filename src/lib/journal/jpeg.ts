/**
 * Minimal JPEG inspection: confirms the bytes are a baseline/progressive JPEG and reads its size.
 * Uploads are re-encoded in the browser (which also strips EXIF/location), so the server only
 * needs to verify the format and dimensions, not decode the image.
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_DIMENSION = 4096;

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export function inspectJpeg(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2; // markers without a length
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if (SOF_MARKERS.has(marker)) {
      if (length < 7) return null;
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (marker === 0xda) return null; // start of scan before any frame header
    offset += 2 + length;
  }
  return null;
}

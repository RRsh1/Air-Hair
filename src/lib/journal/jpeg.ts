/**
 * Strict JPEG check and clean-up for uploads.
 *
 * The browser already re-encodes photos (which strips EXIF/location), but the server can't trust
 * that. This walks the whole file: only the segments a plain baseline/progressive 8-bit JPEG needs
 * are kept; metadata segments (APP1–APP15: EXIF, XMP, ICC…, and comments) are dropped; the file
 * must contain image data and end exactly at its end-of-image marker, so nothing can ride along
 * after it (polyglot files). The result is what gets stored.
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_DIMENSION = 4096;

export type CleanJpeg = { bytes: Uint8Array; width: number; height: number };

const SOF_BASELINE = 0xc0;
const SOF_EXTENDED = 0xc1;
const SOF_PROGRESSIVE = 0xc2;
const DHT = 0xc4;
const DQT = 0xdb;
const DRI = 0xdd;
const SOS = 0xda;
const EOI = 0xd9;
const APP0 = 0xe0;
const COM = 0xfe;

const isRst = (marker: number) => marker >= 0xd0 && marker <= 0xd7;
const isAppN = (marker: number) => marker > APP0 && marker <= 0xef;

export function sanitizeJpeg(bytes: Uint8Array): CleanJpeg | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let size: { width: number; height: number } | null = null;
  let scans = 0;
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === undefined) return null;
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === EOI) {
      if (!size || scans === 0 || offset + 2 !== bytes.length) return null;
      kept.push(bytes.subarray(offset, offset + 2));
      return { bytes: concat(kept), ...size };
    }
    if (offset + 4 > bytes.length) return null;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    const segment = bytes.subarray(offset, end);

    if (marker === SOF_BASELINE || marker === SOF_EXTENDED || marker === SOF_PROGRESSIVE) {
      if (size || length < 8) return null;
      const precision = bytes[offset + 4];
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      const components = bytes[offset + 9];
      if (precision !== 8 || width === 0 || height === 0) return null;
      if ((components !== 1 && components !== 3) || length !== 8 + components * 3) return null;
      size = { width, height };
      kept.push(segment);
      offset = end;
    } else if (marker === DHT || marker === DQT || marker === DRI || marker === APP0) {
      kept.push(segment);
      offset = end;
    } else if (isAppN(marker) || marker === COM) {
      offset = end; // metadata: dropped
    } else if (marker === SOS) {
      if (!size) return null;
      kept.push(segment);
      const dataStart = end;
      offset = scanEnd(bytes, dataStart);
      if (offset < 0 || offset === dataStart) return null;
      kept.push(bytes.subarray(dataStart, offset));
      scans += 1;
    } else {
      return null; // arithmetic coding, lossless, hierarchical, unknown or misplaced markers
    }
  }
  return null; // no end-of-image marker
}

/** Index of the first marker after entropy-coded data (stuffed 0xFF00 and restart markers are data). */
function scanEnd(bytes: Uint8Array, start: number): number {
  for (let i = start; i < bytes.length - 1; i++) {
    if (bytes[i] !== 0xff) continue;
    const next = bytes[i + 1];
    if (next === 0x00 || isRst(next)) {
      i += 1;
      continue;
    }
    if (next === 0xff) continue;
    return i;
  }
  return -1;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

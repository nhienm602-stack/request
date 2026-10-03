/**
 * Magic-byte detection for uploaded files.
 *
 * A browser-reported MIME type and a filename extension are both client
 * controlled, so neither says anything about what a file actually contains.
 * These checks read the leading bytes instead, which a client cannot forge
 * without genuinely sending a file of that format.
 *
 * This is a *format* check, not a safety check. It proves a file is shaped like
 * a JPEG; it does not prove the JPEG is harmless. Malware scanning is a separate
 * concern and needs a real scanner (see docs/ROADMAP.md).
 */

export type FileKind = "jpeg" | "png" | "heic" | "mp4" | "quicktime" | "webm";

/** Enough to cover the longest signature plus an ISO-BMFF brand list. */
export const SIGNATURE_SAMPLE_BYTES = 32;

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// EBML header, shared by WebM and Matroska.
const EBML = [0x1a, 0x45, 0xdf, 0xa3];

/**
 * ISO base media file format brands. HEIC and MP4 share a container, so the
 * `ftyp` brand at offset 8 is what separates a photo from a video.
 */
const HEIF_BRANDS = new Set([
  "heic", "heix", "heim", "heis",
  "hevc", "hevx", "hevm", "hevs",
  "mif1", "msf1",
]);

const MP4_BRANDS = new Set([
  "isom", "iso2", "iso4", "iso5", "iso6",
  "mp41", "mp42", "avc1", "dash", "mmp4", "M4V ",
]);

const QUICKTIME_BRANDS = new Set(["qt  "]);

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return "";
  let out = "";
  for (let i = offset; i < offset + length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

/**
 * Identifies the format from the leading bytes, or `null` if unrecognised.
 * Pass at least {@link SIGNATURE_SAMPLE_BYTES} bytes.
 */
export function detectFileKind(bytes: Uint8Array): FileKind | null {
  if (startsWith(bytes, JPEG)) return "jpeg";
  if (startsWith(bytes, PNG)) return "png";
  if (startsWith(bytes, EBML)) return "webm";

  // ISO-BMFF: a size field, then "ftyp", then the four-character brand.
  if (asciiAt(bytes, 4, 4) === "ftyp") {
    const brand = asciiAt(bytes, 8, 4);
    if (HEIF_BRANDS.has(brand)) return "heic";
    if (QUICKTIME_BRANDS.has(brand)) return "quicktime";
    if (MP4_BRANDS.has(brand)) return "mp4";
    // An unlisted brand is still ISO-BMFF. Treating it as MP4 would let an
    // unknown container through, so report it as unrecognised instead.
    return null;
  }

  return null;
}

export const PHOTO_KINDS: readonly FileKind[] = ["jpeg", "png", "heic"];
export const VIDEO_KINDS: readonly FileKind[] = ["mp4", "quicktime", "webm"];

/** Reads just the head of a file — never the whole thing into memory. */
export async function readSignature(file: Blob): Promise<Uint8Array> {
  const head = file.slice(0, SIGNATURE_SAMPLE_BYTES);
  return new Uint8Array(await head.arrayBuffer());
}

export async function detectBlobKind(file: Blob): Promise<FileKind | null> {
  return detectFileKind(await readSignature(file));
}

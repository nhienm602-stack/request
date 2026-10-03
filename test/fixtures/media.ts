/**
 * Byte-accurate media fixtures shared by the unit, component, and E2E suites.
 *
 * The server sniffs magic bytes, so tests cannot use zero-filled buffers with a
 * MIME label — they would be rejected, and rightly so. Keeping the bytes in one
 * place means the three suites cannot drift into testing different things.
 */

/** Smallest valid PNG: an 8-bit 1×1 image. */
export const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Smallest valid baseline JPEG: a 1×1 image, SOI through EOI. */
export const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
  "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

function fromBase64(base64: string): Uint8Array {
  // `atob` in jsdom/browser, `Buffer` in Node — both suites run this file.
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export const pngBytes = (): Uint8Array => fromBase64(PNG_BASE64);
export const jpegBytes = (): Uint8Array => fromBase64(JPEG_BASE64);

/**
 * An MP4 container: a valid `ftyp` box followed by an empty `mdat`.
 *
 * Enough to satisfy the container signature check. It carries no decodable
 * track, so a browser's duration probe reports "cannot determine" — deliberately
 * the lenient path, since real recordings from some devices behave the same way
 * until seeked.
 */
export function mp4Bytes(): Uint8Array {
  const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
  return Uint8Array.from([
    0x00, 0x00, 0x00, 0x18, // ftyp box size: 24 bytes
    ...ascii("ftyp"),
    ...ascii("isom"), // major brand
    0x00, 0x00, 0x02, 0x00, // minor version
    ...ascii("isomiso2"), // compatible brands
    0x00, 0x00, 0x00, 0x08, // mdat box size: 8 bytes
    ...ascii("mdat"),
  ]);
}

/** Genuinely not an image — used for the rejection paths. */
export function pdfBytes(): Uint8Array {
  return Uint8Array.from([...[0x25, 0x50, 0x44, 0x46], ...[0x2d, 0x31, 0x2e, 0x34, 0x0a]]);
}

/** Pads a fixture out to a given size while keeping its leading signature. */
export function padded(bytes: Uint8Array, totalBytes: number): Uint8Array {
  if (totalBytes <= bytes.length) return bytes;
  const out = new Uint8Array(totalBytes);
  out.set(bytes, 0);
  return out;
}

export const jpegFile = (name = "front.jpg", size?: number): File =>
  new File([toBlobPart(size ? padded(jpegBytes(), size) : jpegBytes())], name, {
    type: "image/jpeg",
  });

export const pngFile = (name = "back.png", size?: number): File =>
  new File([toBlobPart(size ? padded(pngBytes(), size) : pngBytes())], name, {
    type: "image/png",
  });

export const mp4File = (name = "selfie.mp4", size?: number): File =>
  new File([toBlobPart(size ? padded(mp4Bytes(), size) : mp4Bytes())], name, {
    type: "video/mp4",
  });

export const pdfFile = (name = "notes.pdf"): File =>
  new File([toBlobPart(pdfBytes())], name, { type: "application/pdf" });

/** A HEIC-branded file that browsers commonly report with an empty MIME type. */
export const heicFile = (name = "IMG_0042.HEIC"): File => {
  const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
  const bytes = Uint8Array.from([
    0x00, 0x00, 0x00, 0x18,
    ...ascii("ftyp"),
    ...ascii("heic"),
    0x00, 0x00, 0x00, 0x00,
    ...ascii("mif1heic"),
  ]);
  return new File([toBlobPart(bytes)], name, { type: "" });
};

/**
 * `File`/`Blob` accept an `ArrayBuffer`, and handing over a copy avoids the
 * detached-buffer surprises that come from reusing a shared view.
 */
function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

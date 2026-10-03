/**
 * File constraints for the verification step.
 *
 * Kept separate from the schema so the same numbers drive the schema, the
 * `accept` attributes, and the hint text users read *before* they pick a file.
 * A limit the user only discovers by tripping over it is a bug.
 */

export const MEGABYTE = 1024 * 1024;

export interface MediaConstraints {
  readonly maxBytes: number;
  /** MIME types accepted. Also used verbatim for the input's `accept`. */
  readonly mimeTypes: readonly string[];
  /** Extension fallback — browsers report HEIC as `""` on some platforms. */
  readonly extensions: readonly string[];
  /** Human-readable list for hints and error messages. */
  readonly label: string;
}

export const PHOTO_CONSTRAINTS: MediaConstraints = {
  maxBytes: 10 * MEGABYTE,
  mimeTypes: ["image/jpeg", "image/png", "image/heic", "image/heif"],
  extensions: [".jpg", ".jpeg", ".png", ".heic", ".heif"],
  label: "JPG, PNG or HEIC",
};

export const VIDEO_CONSTRAINTS: MediaConstraints = {
  maxBytes: 50 * MEGABYTE,
  mimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
  extensions: [".mp4", ".mov", ".webm"],
  label: "MP4, MOV or WebM",
};

export const VIDEO_MIN_DURATION_SECONDS = 3;
export const VIDEO_MAX_DURATION_SECONDS = 60;

/** Value for an `<input type="file">` `accept` attribute. */
export function acceptAttribute(constraints: MediaConstraints): string {
  return [...constraints.mimeTypes, ...constraints.extensions].join(",");
}

export function hasAllowedExtension(fileName: string, constraints: MediaConstraints): boolean {
  const lower = fileName.toLowerCase();
  return constraints.extensions.some((extension) => lower.endsWith(extension));
}

/**
 * Some browsers report an empty or generic MIME type for HEIC/HEIF and for
 * files captured by certain Android camera apps, so the extension is a valid
 * secondary signal. This is a usability check, not a security control — the
 * server must still treat the bytes as untrusted.
 */
export function hasAllowedType(file: File, constraints: MediaConstraints): boolean {
  if (constraints.mimeTypes.includes(file.type)) return true;
  if (file.type === "" || file.type === "application/octet-stream") {
    return hasAllowedExtension(file.name, constraints);
  }
  return false;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MEGABYTE) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / MEGABYTE;
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

/** HEIC cannot be decoded by `<img>` in most browsers — show a placeholder instead. */
export function isPreviewableImage(file: File): boolean {
  return file.type === "image/jpeg" || file.type === "image/png";
}

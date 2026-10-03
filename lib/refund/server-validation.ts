import {
  PHOTO_KINDS,
  VIDEO_KINDS,
  detectBlobKind,
  type FileKind,
} from "./file-signature";
import type { Verification } from "./verification-schema";

/**
 * Server-side checks that cannot live in the Zod schema.
 *
 * The schema is synchronous and shared with the browser; reading a file's bytes
 * is neither, so this lives apart from it.
 *
 * **Import this only from server code.** It is reachable today solely from the
 * submission boundary. Nothing enforces that mechanically — adding the
 * `server-only` package would, and is worth doing if this module ever grows
 * server-side secrets. Running these checks in the browser would be actively
 * misleading: they would appear to pass while being trivially bypassable.
 */

type FileField = keyof Verification;

const EXPECTED_KINDS: Record<FileField, readonly FileKind[]> = {
  frontPhoto: PHOTO_KINDS,
  backPhoto: PHOTO_KINDS,
  videoSelfie: VIDEO_KINDS,
};

const SUBJECTS: Record<FileField, string> = {
  frontPhoto: "The front photo",
  backPhoto: "The back photo",
  videoSelfie: "The video selfie",
};

export type FieldErrors = Record<string, string[]>;

/**
 * Confirms each uploaded file really is the format it claims to be.
 *
 * Returns per-field errors in the same shape the schemas produce, so callers
 * can merge the two without special-casing.
 */
export async function verifyFileSignatures(files: Verification): Promise<FieldErrors> {
  const fields = Object.keys(EXPECTED_KINDS) as FileField[];

  // Checked concurrently: the three reads are independent, and each touches only
  // the first few bytes.
  const results = await Promise.all(
    fields.map(async (field) => {
      const kind = await detectBlobKind(files[field]);
      const allowed = EXPECTED_KINDS[field];
      return { field, ok: kind !== null && allowed.includes(kind) };
    })
  );

  const errors: FieldErrors = {};
  for (const { field, ok } of results) {
    if (ok) continue;
    // The message deliberately does not echo the detected format back. It is
    // attacker-controlled input, and naming it invites probing for what the
    // sniffer accepts.
    const medium = field === "videoSelfie" ? "video" : "image";
    errors[field] = [
      `${SUBJECTS[field]} does not look like a valid ${medium} file. Re-export it and try again.`,
    ];
  }
  return errors;
}

/**
 * Step 2 — identity and product verification.
 *
 * Like the details schema, this runs on both sides of the wire. Note that only
 * *cheap, structural* checks live here: size, type, presence. Duration and pixel
 * dimensions need to decode the file, so they run asynchronously in the browser
 * (see hooks/use-media-metadata.ts) and are re-derived server-side only if the
 * deployment adds a media pipeline.
 */
import { z } from "zod";
import {
  PHOTO_CONSTRAINTS,
  VIDEO_CONSTRAINTS,
  type MediaConstraints,
  formatBytes,
  hasAllowedType,
} from "./media";
import { type FileField } from "./submission-contract";

/**
 * `z.instanceof(File)` is avoided deliberately: `File` is realm-scoped, so a
 * file produced in one jsdom realm fails an `instanceof` check in another and
 * tests break for reasons that have nothing to do with the rule under test.
 * Structural duck-typing is both more portable and easier to fake in tests.
 */
const fileLike = z.custom<File>(
  (value): value is File =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).name === "string" &&
    typeof (value as File).size === "number" &&
    typeof (value as File).type === "string",
  { error: "Select a file." }
);

function mediaFile(constraints: MediaConstraints, subject: string) {
  return fileLike
    .refine((file) => file.size > 0, {
      error: `${subject} appears to be empty. Choose a different file.`,
    })
    .refine((file) => file.size <= constraints.maxBytes, {
      error: `${subject} must be ${formatBytes(constraints.maxBytes)} or smaller.`,
    })
    .refine((file) => hasAllowedType(file, constraints), {
      error: `${subject} must be a ${constraints.label} file.`,
    });
}

/**
 * Per-slot configuration — one source of truth for the constraints, the subject
 * used in size/type messages, and the "you didn't add this" message. Both the
 * whole-form schema and the single-file schema below are built from it, so the
 * chunked upload path and the legacy all-at-once path validate identically.
 */
const SLOT_CONFIG: Record<
  FileField,
  { constraints: MediaConstraints; subject: string; missing: string }
> = {
  frontPhoto: {
    constraints: PHOTO_CONSTRAINTS,
    subject: "The front photo",
    missing: "Add a photo of the front of the product.",
  },
  backPhoto: {
    constraints: PHOTO_CONSTRAINTS,
    subject: "The back photo",
    missing: "Add a photo of the back of the product.",
  },
  videoSelfie: {
    constraints: VIDEO_CONSTRAINTS,
    subject: "The video selfie",
    missing: "Add a video selfie so we can verify your request.",
  },
};

/**
 * Validates a single upload slot. Used by the chunked protocol, which receives
 * one file per request and so cannot run the whole-form schema.
 */
export function fileSlotSchema(slot: FileField) {
  const { constraints, subject, missing } = SLOT_CONFIG[slot];
  return mediaFile(constraints, subject)
    .nullable()
    .refine((file): file is File => file !== null, { error: missing });
}

export const verificationSchema = z.object({
  frontPhoto: fileSlotSchema("frontPhoto"),
  backPhoto: fileSlotSchema("backPhoto"),
  videoSelfie: fileSlotSchema("videoSelfie"),
});

export type VerificationInput = z.input<typeof verificationSchema>;
export type Verification = z.output<typeof verificationSchema>;

export const EMPTY_VERIFICATION: VerificationInput = {
  frontPhoto: null,
  backPhoto: null,
  videoSelfie: null,
};

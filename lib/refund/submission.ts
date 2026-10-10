import { z } from "zod";
import { refundDetailsSchema } from "./details-schema";
import { verificationSchema, fileSlotSchema } from "./verification-schema";
import { verifyFileSignatures, verifyFileSignature } from "./server-validation";
import {
  handOffRefundSubmission,
  sendDetailsMessage,
  sendFileToTelegram,
  createReference,
  RefundHandOffNotImplementedError,
  type ValidatedRefundSubmission,
} from "./submission-handoff";
import { DETAILS_FIELD, type FieldErrors, type FileField } from "./submission-contract";

/**
 * Application-side handling of a refund submission.
 *
 * Its job is to turn raw `FormData` into a fully validated
 * `ValidatedRefundSubmission`, then pass it to the hand-off point. It does not
 * decide what happens to the submission after that — see
 * `./submission-handoff.ts`.
 *
 * Deliberately free of HTTP concerns: it takes `FormData` and returns an
 * outcome. `app/api/refund-requests/route.ts` is the only thing that knows
 * about status codes, which keeps this directly testable.
 *
 * **Import only from server code.** It reads file bytes, which has no place in
 * a client bundle.
 */

export type SubmissionOutcome =
  | { status: "accepted"; reference: string }
  | { status: "invalid"; fieldErrors: FieldErrors; message?: string }
  | { status: "not-implemented"; message: string }
  | { status: "failed"; message: string };

const GENERIC_FAILURE = "We could not submit your request just now. Please try again in a moment.";

const NOT_IMPLEMENTED =
  "Refund submissions are not connected to a service yet, so this request was not sent.";

const STALE_DETAILS =
  "Some of your order details are no longer valid. Go back and check them, then try again.";

export async function processRefundSubmission(formData: FormData): Promise<SubmissionOutcome> {
  const validation = await validateRefundSubmission(formData);
  if (!validation.ok) {
    return { status: "invalid", fieldErrors: validation.fieldErrors, message: validation.message };
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // Hand-off. Everything above is application validation; this call is where
    // the submission leaves the app. See ./submission-handoff.ts.
    // ─────────────────────────────────────────────────────────────────────────
    const { reference } = await handOffRefundSubmission(validation.submission);

    // A hand-off that resolves without a usable reference is a bug in the
    // integration, not a user error — the confirmation page has nothing to show.
    if (typeof reference !== "string" || reference.trim() === "") {
      console.error("[refund] hand-off resolved without a reference");
      return { status: "failed", message: GENERIC_FAILURE };
    }

    return { status: "accepted", reference: reference.trim() };
  } catch (cause) {
    if (cause instanceof RefundHandOffNotImplementedError) {
      return { status: "not-implemented", message: NOT_IMPLEMENTED };
    }
    // The cause stays server-side. Returning it would leak internal detail for
    // no user benefit.
    console.error("[refund] hand-off failed", cause);
    return { status: "failed", message: GENERIC_FAILURE };
  }
}

/**
 * Maps a thrown hand-off error onto an outcome, identically to the catch in
 * `processRefundSubmission`. Shared so every entry point reports a missing
 * integration as `not-implemented` and everything else as a logged `failed`.
 */
function handOffFailure(cause: unknown): SubmissionOutcome {
  if (cause instanceof RefundHandOffNotImplementedError) {
    return { status: "not-implemented", message: NOT_IMPLEMENTED };
  }
  console.error("[refund] hand-off failed", cause);
  return { status: "failed", message: GENERIC_FAILURE };
}

/**
 * Step 1 of the chunked protocol: validate the details and the first file,
 * create the reference, and send the details message plus that file.
 *
 * Returns the reference so the client can tag the remaining file requests.
 */
export async function processInitStep(input: {
  details: FormDataEntryValue | null;
  frontPhoto: File | null;
}): Promise<SubmissionOutcome> {
  const detailsResult = parseDetails(input.details);
  if (!detailsResult.success) {
    return {
      status: "invalid",
      fieldErrors: z.flattenError(detailsResult.error).fieldErrors as FieldErrors,
      message: STALE_DETAILS,
    };
  }

  const fileResult = await validateOneFile("frontPhoto", input.frontPhoto);
  if (!fileResult.ok) {
    return { status: "invalid", fieldErrors: fileResult.fieldErrors };
  }

  const reference = createReference();
  try {
    await sendDetailsMessage(reference, detailsResult.data);
    await sendFileToTelegram(reference, "frontPhoto", fileResult.file);
  } catch (cause) {
    return handOffFailure(cause);
  }

  return { status: "accepted", reference };
}

/**
 * A later step of the chunked protocol: validate one further file and send it
 * under the reference created by {@link processInitStep}.
 */
export async function processFileStep(input: {
  reference: string;
  slot: FileField;
  file: File | null;
}): Promise<SubmissionOutcome> {
  const fileResult = await validateOneFile(input.slot, input.file);
  if (!fileResult.ok) {
    return { status: "invalid", fieldErrors: fileResult.fieldErrors };
  }

  try {
    await sendFileToTelegram(input.reference, input.slot, fileResult.file);
  } catch (cause) {
    return handOffFailure(cause);
  }

  return { status: "accepted", reference: input.reference };
}

type SingleFileResult =
  | { ok: true; file: File }
  | { ok: false; fieldErrors: FieldErrors };

/** Validates one upload slot: the structural schema, then the byte signature. */
async function validateOneFile(slot: FileField, file: File | null): Promise<SingleFileResult> {
  const parsed = fileSlotSchema(slot).safeParse(file);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Select a valid file.";
    return { ok: false, fieldErrors: { [slot]: [message] } };
  }

  const signatureError = await verifyFileSignature(slot, parsed.data);
  if (signatureError) {
    return { ok: false, fieldErrors: { [slot]: signatureError } };
  }

  return { ok: true, file: parsed.data };
}

type ValidationResult =
  | { ok: true; submission: ValidatedRefundSubmission }
  | { ok: false; fieldErrors: FieldErrors; message?: string };

/**
 * Validates a raw submission, in increasing order of cost.
 *
 * Exported so the validation rules can be exercised, and reused, without
 * invoking the hand-off. Every field is treated as hostile: the endpoint is
 * reachable without ever loading the UI, so the browser-side checks carry no
 * authority here.
 */
export async function validateRefundSubmission(formData: FormData): Promise<ValidationResult> {
  const detailsResult = parseDetails(formData.get(DETAILS_FIELD));
  if (!detailsResult.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(detailsResult.error).fieldErrors as FieldErrors,
      message: STALE_DETAILS,
    };
  }

  const filesResult = verificationSchema.safeParse({
    frontPhoto: asFile(formData.get("frontPhoto")),
    backPhoto: asFile(formData.get("backPhoto")),
    videoSelfie: asFile(formData.get("videoSelfie")),
  });
  if (!filesResult.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(filesResult.error).fieldErrors as FieldErrors,
    };
  }

  // Confirms each file really is the format it claims. Runs last because it is
  // the only check that reads file contents, so a missing or oversized file is
  // rejected without any I/O.
  const signatureErrors = await verifyFileSignatures(filesResult.data);
  if (Object.keys(signatureErrors).length > 0) {
    return { ok: false, fieldErrors: signatureErrors };
  }

  return {
    ok: true,
    submission: { details: detailsResult.data, files: filesResult.data },
  };
}

function parseDetails(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string") return refundDetailsSchema.safeParse(undefined);
  try {
    return refundDetailsSchema.safeParse(JSON.parse(raw) as unknown);
  } catch {
    // Malformed JSON is invalid input, not a crash.
    return refundDetailsSchema.safeParse(undefined);
  }
}

/** `FormData.get` yields `string | File | null`; only a real File is usable. */
function asFile(value: FormDataEntryValue | null): File | null {
  return value instanceof File ? value : null;
}

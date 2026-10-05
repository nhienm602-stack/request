import { z } from "zod";
import { refundDetailsSchema } from "./details-schema";
import { verificationSchema } from "./verification-schema";
import { verifyFileSignatures } from "./server-validation";
import {
  handOffRefundSubmission,
  RefundHandOffNotImplementedError,
  type ValidatedRefundSubmission,
} from "./submission-handoff";
import { DETAILS_FIELD, type FieldErrors } from "./submission-contract";

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

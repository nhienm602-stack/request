import type { NextRequest } from "next/server";
import {
  processRefundSubmission,
  processInitStep,
  processFileStep,
  type SubmissionOutcome,
} from "@/lib/refund/submission";
import {
  DETAILS_FIELD,
  REFERENCE_FIELD,
  SLOT_FIELD,
  STEP_FIELD,
  isFileField,
  type RefundSubmissionAccepted,
  type RefundSubmissionRejected,
} from "@/lib/refund/submission-contract";

/**
 * `POST /api/refund-requests` — the application's submission boundary.
 *
 * A thin HTTP adapter: it parses the request, delegates to
 * `processRefundSubmission`, and maps the outcome onto a status code. All
 * validation and domain logic lives in `lib/refund/submission.ts`, so this file
 * stays readable and the logic stays testable without a server.
 *
 * The integration attaches at the hand-off point in
 * `lib/refund/submission-handoff.ts`, not here.
 *
 * ---
 * **Note for whoever wires up the real backend:**
 *
 * This route replaced a Server Action, which gave two things for free that a
 * Route Handler does not:
 *
 * 1. **CSRF protection.** Server Actions verify `Origin` against `Host`. This
 *    endpoint accepts any origin. It is unauthenticated and carries no ambient
 *    session today, so there is nothing to ride — but the moment it sits behind
 *    a session cookie, it needs an origin check or a CSRF token.
 * 2. **A body size limit.** `serverActions.bodySizeLimit` no longer applies.
 *    Request size is now whatever the hosting platform and any proxy in front
 *    of it allow, which varies by deployment — so it is deliberately not
 *    hard-coded here. Confirm the limit clears the per-file maximums in
 *    `lib/refund/media.ts` (10MB × 2 photos + 50MB video).
 */

/** Uploads are streamed and can be large; this must not be statically cached. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    // 415: the request itself is well-formed, the encoding is simply not one
    // this endpoint accepts.
    return rejected(415, "Send the refund request as multipart/form-data.");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    // A truncated upload, a malformed multipart body, or a payload the platform
    // cut off. Indistinguishable from here, and all are the caller's problem.
    return rejected(400, "The upload could not be read. Please try again.");
  }

  const outcome = await dispatch(formData);
  // A protocol-level problem (bad step/slot/reference) is already a Response.
  if (outcome instanceof Response) return outcome;

  switch (outcome.status) {
    case "accepted":
      return accepted(outcome.reference);

    case "invalid":
      return rejected(
        422,
        outcome.message ?? "Please check the highlighted fields and try again.",
        outcome.fieldErrors
      );

    case "not-implemented":
      // 501: the request was understood and fully validated, but no integration
      // is wired up to receive it yet. Distinct from 500 — nothing is broken,
      // and answering 201 here would claim the request had been recorded.
      return rejected(501, outcome.message);

    case "failed":
      return rejected(500, outcome.message);
  }
}

/**
 * Routes the request to the right handler based on its `step`:
 *   - no step  → the legacy single-request path (all fields at once).
 *   - "init"   → details + the first file.
 *   - "file"   → one further file, under the reference from the init step.
 * Returns a `Response` directly only for a malformed protocol request (400);
 * otherwise a `SubmissionOutcome` the caller maps to a status code.
 */
async function dispatch(formData: FormData): Promise<SubmissionOutcome | Response> {
  const step = formData.get(STEP_FIELD);

  if (step === null) {
    return processRefundSubmission(formData);
  }

  if (step === "init") {
    return processInitStep({
      details: formData.get(DETAILS_FIELD),
      frontPhoto: asFile(formData.get("frontPhoto")),
    });
  }

  if (step === "file") {
    const reference = formData.get(REFERENCE_FIELD);
    if (typeof reference !== "string" || reference.trim() === "") {
      return rejected(400, "This upload is missing its submission reference. Please try again.");
    }
    const slot = formData.get(SLOT_FIELD);
    if (!isFileField(slot)) {
      return rejected(400, "This upload names an unknown file. Please try again.");
    }
    return processFileStep({
      reference: reference.trim(),
      slot,
      file: asFile(formData.get(slot)),
    });
  }

  return rejected(400, "Unrecognised submission step.");
}

/** `FormData.get` yields `string | File | null`; only a real File is usable. */
function asFile(value: FormDataEntryValue | null): File | null {
  return value instanceof File ? value : null;
}

function accepted(reference: string): Response {
  const body: RefundSubmissionAccepted = { reference };
  // 201: a refund request now exists and is identified by `reference`.
  return Response.json(body, { status: 201 });
}

function rejected(
  status: number,
  message: string,
  fieldErrors?: RefundSubmissionRejected["error"]["fieldErrors"]
): Response {
  const body: RefundSubmissionRejected = {
    error: fieldErrors ? { message, fieldErrors } : { message },
  };
  return Response.json(body, { status });
}

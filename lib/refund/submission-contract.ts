/**
 * The wire contract between the browser and the internal submission endpoint.
 *
 * Types and constants only — no logic, and nothing server-side. Both halves
 * import this, so the request the client builds and the request the endpoint
 * parses cannot drift apart. Anything with a runtime dependency on the server
 * (the repository, file sniffing) lives in `submission.ts`, which the client
 * must never import.
 */

/** The internal endpoint the refund form posts to. */
export const REFUND_SUBMISSION_ENDPOINT = "/api/refund-requests";

/** `FormData` key carrying the step 1 details as a JSON string. */
export const DETAILS_FIELD = "details";

/** `FormData` keys carrying the step 2 uploads. */
export const FILE_FIELDS = ["frontPhoto", "backPhoto", "videoSelfie"] as const;

export type FileField = (typeof FILE_FIELDS)[number];

export function isFileField(value: unknown): value is FileField {
  return typeof value === "string" && (FILE_FIELDS as readonly string[]).includes(value);
}

/**
 * Chunked upload protocol.
 *
 * The files are too large to send in one request: a host's serverless request
 * body limit (Netlify's is ~6 MB) is far below the combined size of two photos
 * and a video. So the client sends several small requests to the same endpoint,
 * each tagged with `STEP_FIELD`, each carrying at most one file:
 *
 *   1. `init`  — the details JSON + the first file (`frontPhoto`). The server
 *                validates the details and that file, creates the reference, and
 *                returns it.
 *   2. `file`  — one further file, tagged with `SLOT_FIELD` and the reference
 *                from step 1 in `REFERENCE_FIELD`. Sent once per remaining file.
 *
 * The endpoint still accepts a single legacy request with no `STEP_FIELD` (all
 * fields at once); that path is unchanged, but the browser no longer uses it
 * because the body would exceed the host limit.
 */
export const STEP_FIELD = "step";
export const SLOT_FIELD = "slot";
export const REFERENCE_FIELD = "reference";

export const SUBMISSION_STEPS = ["init", "file"] as const;
export type SubmissionStep = (typeof SUBMISSION_STEPS)[number];

/** Per-field validation messages, keyed by form field name. */
export type FieldErrors = Partial<Record<string, string[]>>;

/** 201 response body. */
export interface RefundSubmissionAccepted {
  reference: string;
}

/** 4xx/5xx response body. */
export interface RefundSubmissionRejected {
  error: {
    /** Safe to show the user as-is. Never carries internal detail. */
    message: string;
    /** Present only when individual fields can be blamed. */
    fieldErrors?: FieldErrors;
  };
}

export type RefundSubmissionResponseBody =
  | RefundSubmissionAccepted
  | RefundSubmissionRejected;

export function isAccepted(
  body: RefundSubmissionResponseBody
): body is RefundSubmissionAccepted {
  return "reference" in body;
}

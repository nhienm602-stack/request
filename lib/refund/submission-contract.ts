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

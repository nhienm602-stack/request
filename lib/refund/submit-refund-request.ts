"use client";

import {
  DETAILS_FIELD,
  REFUND_SUBMISSION_ENDPOINT,
  isAccepted,
  type FieldErrors,
  type RefundSubmissionResponseBody,
} from "./submission-contract";
import type { RefundDetails } from "./details-schema";
import type { Verification } from "./verification-schema";

/**
 * Client-side call to the internal submission endpoint.
 *
 * Keeps `fetch`, multipart assembly, and response parsing out of the form
 * component, which stays concerned with rendering and validation. The returned
 * shape is a discriminated union so callers cannot read `reference` off a
 * failure by accident.
 */
export type SubmitResult =
  | { status: "success"; reference: string }
  | { status: "invalid"; fieldErrors: FieldErrors; formError?: string }
  | { status: "error"; formError: string };

const NETWORK_ERROR =
  "We could not reach the server. Check your connection and try again.";

const UNEXPECTED_ERROR =
  "We could not submit your request just now. Please try again in a moment.";

export async function submitRefundRequest(
  details: RefundDetails,
  files: Verification,
  options: { signal?: AbortSignal } = {}
): Promise<SubmitResult> {
  const formData = new FormData();
  // The details travel as JSON so the object the browser validated is byte-for-
  // byte the object the server re-validates.
  formData.set(DETAILS_FIELD, JSON.stringify(details));
  formData.set("frontPhoto", files.frontPhoto);
  formData.set("backPhoto", files.backPhoto);
  formData.set("videoSelfie", files.videoSelfie);

  let response: Response;
  try {
    response = await fetch(REFUND_SUBMISSION_ENDPOINT, {
      method: "POST",
      // No explicit Content-Type: the browser must set the multipart boundary
      // itself, and overriding it produces a body the server cannot parse.
      body: formData,
      signal: options.signal,
    });
  } catch {
    // Offline, DNS failure, or an aborted request.
    return { status: "error", formError: NETWORK_ERROR };
  }

  const body = await readBody(response);

  if (response.ok && body !== null && isAccepted(body) && typeof body.reference === "string") {
    return { status: "success", reference: body.reference };
  }

  // Anything else is a failure — including a 2xx whose body does not match the
  // contract, which means something between here and the endpoint (a proxy, a
  // captive portal) answered instead of the app.
  const { message, fieldErrors } = readError(body);

  // 4xx means the caller can fix it by changing the input; 5xx means retrying
  // the same input might work. Only the former gets mapped onto fields.
  if (response.status >= 400 && response.status < 500) {
    return { status: "invalid", fieldErrors, formError: message };
  }

  return { status: "error", formError: message };
}

/** A non-JSON body (a proxy error page, say) must not throw. */
async function readBody(response: Response): Promise<RefundSubmissionResponseBody | null> {
  try {
    return (await response.json()) as RefundSubmissionResponseBody;
  } catch {
    return null;
  }
}

/**
 * Pulls the error out of a response body without trusting its shape.
 *
 * The body is parsed JSON from the network, so it may be anything at all — the
 * static type is an expectation, not a guarantee. Reading `body.error.message`
 * directly throws the moment something other than this endpoint replies.
 */
function readError(body: RefundSubmissionResponseBody | null): {
  message: string;
  fieldErrors: FieldErrors;
} {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error !== "object" || error === null) {
    return { message: UNEXPECTED_ERROR, fieldErrors: {} };
  }

  const { message, fieldErrors } = error as { message?: unknown; fieldErrors?: unknown };
  return {
    message: typeof message === "string" && message !== "" ? message : UNEXPECTED_ERROR,
    fieldErrors:
      typeof fieldErrors === "object" && fieldErrors !== null ? (fieldErrors as FieldErrors) : {},
  };
}

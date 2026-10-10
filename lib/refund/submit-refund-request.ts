"use client";

import {
  DETAILS_FIELD,
  FILE_FIELDS,
  REFERENCE_FIELD,
  REFUND_SUBMISSION_ENDPOINT,
  SLOT_FIELD,
  STEP_FIELD,
  isAccepted,
  type FieldErrors,
  type FileField,
  type RefundSubmissionResponseBody,
} from "./submission-contract";
import type { RefundDetails } from "./details-schema";
import type { Verification } from "./verification-schema";
import { compressImage } from "./compress-image";

/**
 * Client-side call to the internal submission endpoint.
 *
 * The files are too large to send together (a host caps a single request body
 * well below their combined size), so this sends the submission as a short
 * sequence of small requests — details + first photo, then one request per
 * remaining file — all off a single click. See submission-contract.ts.
 *
 * It is resumable: on failure it returns the progress made so far, and passing
 * that `progress` back into a retry re-sends only the steps that did not
 * complete. That keeps a retry after a dropped video from re-sending the photos
 * and giving the operator a duplicate submission.
 */
export interface SubmitProgress {
  /** The reference once the init step has succeeded; `null` before that. */
  reference: string | null;
  /** Slots already delivered, so a retry can skip them. */
  uploadedSlots: FileField[];
}

export type SubmitResult =
  | { status: "success"; reference: string }
  | { status: "invalid"; fieldErrors: FieldErrors; formError?: string; progress: SubmitProgress }
  | { status: "error"; formError: string; progress: SubmitProgress };

export interface SubmitOptions {
  signal?: AbortSignal;
  /** Progress from a previous attempt, so completed steps are skipped. */
  progress?: SubmitProgress;
  /** Reports which step is in flight, for a progress label on the button. */
  onStep?: (label: string) => void;
}

const NETWORK_ERROR =
  "We could not reach the server. Check your connection and try again.";

const UNEXPECTED_ERROR =
  "We could not submit your request just now. Please try again in a moment.";

export async function submitRefundRequest(
  details: RefundDetails,
  files: Verification,
  options: SubmitOptions = {}
): Promise<SubmitResult> {
  const { signal, onStep } = options;
  let reference = options.progress?.reference ?? null;
  const uploaded = new Set<FileField>(options.progress?.uploadedSlots ?? []);
  const progress = (): SubmitProgress => ({ reference, uploadedSlots: [...uploaded] });

  // Step 1 — details + the first photo. Skipped if a previous attempt got here.
  if (reference === null) {
    onStep?.("Preparing your request…");
    const frontPhoto = await compressImage(files.frontPhoto);
    const step = await postStep(buildFileStep("init", null, "frontPhoto", frontPhoto, details), signal);
    if (step.kind !== "ok") return fromStep(step, progress());
    reference = step.reference;
    uploaded.add("frontPhoto");
  }

  // Defensive: every path above either sets a reference or returns early.
  if (reference === null) {
    return { status: "error", formError: UNEXPECTED_ERROR, progress: progress() };
  }

  // Remaining files, one request each.
  for (const slot of FILE_FIELDS) {
    if (uploaded.has(slot)) continue;
    onStep?.(slot === "videoSelfie" ? "Uploading your video…" : "Uploading your photos…");
    // The video is not re-encoded in the browser; photos are.
    const file = slot === "videoSelfie" ? files[slot] : await compressImage(files[slot]);
    const step = await postStep(buildFileStep("file", reference, slot, file), signal);
    if (step.kind !== "ok") return fromStep(step, progress());
    uploaded.add(slot);
  }

  return { status: "success", reference };
}

type StepResult =
  | { kind: "ok"; reference: string }
  | { kind: "invalid"; fieldErrors: FieldErrors; message?: string }
  | { kind: "error"; message: string };

function buildFileStep(
  step: "init" | "file",
  reference: string | null,
  slot: FileField,
  file: File,
  details?: RefundDetails
): FormData {
  const formData = new FormData();
  formData.set(STEP_FIELD, step);
  if (step === "init" && details) {
    // The details travel as JSON so the object the browser validated is byte-
    // for-byte the object the server re-validates.
    formData.set(DETAILS_FIELD, JSON.stringify(details));
  }
  if (step === "file" && reference) {
    formData.set(REFERENCE_FIELD, reference);
    formData.set(SLOT_FIELD, slot);
  }
  formData.set(slot, file, file.name);
  return formData;
}

async function postStep(body: FormData, signal?: AbortSignal): Promise<StepResult> {
  let response: Response;
  try {
    response = await fetch(REFUND_SUBMISSION_ENDPOINT, {
      method: "POST",
      // No explicit Content-Type: the browser must set the multipart boundary
      // itself, and overriding it produces a body the server cannot parse.
      body,
      signal,
    });
  } catch {
    // Offline, DNS failure, or an aborted request.
    return { kind: "error", message: NETWORK_ERROR };
  }

  const parsed = await readBody(response);

  if (
    response.ok &&
    parsed !== null &&
    isAccepted(parsed) &&
    typeof parsed.reference === "string" &&
    parsed.reference !== ""
  ) {
    return { kind: "ok", reference: parsed.reference };
  }

  // Anything else is a failure — including a 2xx whose body does not match the
  // contract, which means something between here and the endpoint (a proxy, a
  // captive portal) answered instead of the app.
  const { message, fieldErrors } = readError(parsed);

  // 4xx means the caller can fix it by changing the input; 5xx means retrying
  // the same input might work. Only the former gets mapped onto fields.
  if (response.status >= 400 && response.status < 500) {
    return { kind: "invalid", fieldErrors, message };
  }
  return { kind: "error", message };
}

function fromStep(step: StepResult, progress: SubmitProgress): SubmitResult {
  if (step.kind === "invalid") {
    return { status: "invalid", fieldErrors: step.fieldErrors, formError: step.message, progress };
  }
  return { status: "error", formError: step.kind === "error" ? step.message : UNEXPECTED_ERROR, progress };
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

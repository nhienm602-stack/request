import { jpegBytes, mp4Bytes, pdfBytes, pngBytes } from "../test/fixtures/media";

/**
 * Playwright upload descriptors.
 *
 * The bytes come from the shared fixture module so the E2E, component, and unit
 * suites all exercise the same files — the server sniffs magic bytes, and three
 * divergent sets of fixtures would mean three different things being tested.
 */
export interface UploadFixture {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const toBuffer = (bytes: Uint8Array): Buffer => Buffer.from(bytes);

export const pngFixture = (name = "back.png"): UploadFixture => ({
  name,
  mimeType: "image/png",
  buffer: toBuffer(pngBytes()),
});

export const jpegFixture = (name = "front.jpg"): UploadFixture => ({
  name,
  mimeType: "image/jpeg",
  buffer: toBuffer(jpegBytes()),
});

export const mp4Fixture = (name = "selfie.mp4"): UploadFixture => ({
  name,
  mimeType: "video/mp4",
  buffer: toBuffer(mp4Bytes()),
});

/** A file that is genuinely not an image, for the rejection paths. */
export const pdfFixture = (name = "notes.pdf"): UploadFixture => ({
  name,
  mimeType: "application/pdf",
  buffer: toBuffer(pdfBytes()),
});

/** Valid order details used to get through step 1. */
export const VALID_DETAILS = {
  orderNumber: "ORD-48213",
  orderAmount: "49,99",
  fullName: "Maria Rossi",
  email: "maria@example.com",
  phone: "02 1234 5678",
  address: "Via Roma 12",
  city: "Milano",
  country: "IT",
  zipCode: "20121",
} as const;

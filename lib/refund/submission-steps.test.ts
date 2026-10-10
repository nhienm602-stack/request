// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processInitStep, processFileStep } from "./submission";
import {
  sendDetailsMessage,
  sendFileToTelegram,
  RefundHandOffNotImplementedError,
} from "./submission-handoff";
import { heicFile, jpegFile, mp4File, pdfFile, pngFile } from "@/test/fixtures/media";

/**
 * The Telegram senders are replaced so these tests never touch the network. The
 * real module is kept underneath so `createReference` and
 * `RefundHandOffNotImplementedError` stay the genuine implementations.
 */
vi.mock("./submission-handoff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./submission-handoff")>();
  return {
    ...actual,
    sendDetailsMessage: vi.fn(async () => {}),
    sendFileToTelegram: vi.fn(async () => {}),
  };
});

const detailsMessage = vi.mocked(sendDetailsMessage);
const fileSend = vi.mocked(sendFileToTelegram);

const VALID_DETAILS = {
  orderNumber: "ORD-48213",
  orderAmount: "49,99",
  fullName: "Maria Rossi",
  email: "maria@example.com",
  phone: "+39 02 1234 5678",
  address: "Via Roma 12",
  city: "Milano",
  zipCode: "20121",
  country: "IT",
};

const detailsJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ ...VALID_DETAILS, ...overrides });

beforeEach(() => {
  detailsMessage.mockReset().mockResolvedValue(undefined);
  fileSend.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("processInitStep", () => {
  it("validates, creates a reference, and sends the message + first file", async () => {
    const result = await processInitStep({ details: detailsJson(), frontPhoto: jpegFile() });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.reference).toMatch(/^REF-/);

    expect(detailsMessage).toHaveBeenCalledTimes(1);
    expect(detailsMessage.mock.calls[0][1]).toMatchObject({ orderNumber: "ORD-48213" });
    expect(fileSend).toHaveBeenCalledTimes(1);
    expect(fileSend.mock.calls[0][1]).toBe("frontPhoto");
  });

  it("re-validates the details and never sends on failure", async () => {
    const result = await processInitStep({
      details: detailsJson({ email: "nope" }),
      frontPhoto: jpegFile(),
    });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.fieldErrors.email).toBeDefined();
    expect(detailsMessage).not.toHaveBeenCalled();
    expect(fileSend).not.toHaveBeenCalled();
  });

  it("rejects a missing first file", async () => {
    const result = await processInitStep({ details: detailsJson(), frontPhoto: null });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.fieldErrors.frontPhoto?.[0]).toMatch(/front/i);
    expect(fileSend).not.toHaveBeenCalled();
  });

  it("rejects a file whose bytes contradict its declared type", async () => {
    const disguised = new File([pdfFile().slice()], "front.jpg", { type: "image/jpeg" });
    const result = await processInitStep({ details: detailsJson(), frontPhoto: disguised });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.fieldErrors.frontPhoto?.[0]).toMatch(/does not look like a valid image/i);
  });

  it("accepts a HEIC photo reported without a MIME type", async () => {
    const result = await processInitStep({ details: detailsJson(), frontPhoto: heicFile() });
    expect(result.status).toBe("accepted");
  });

  it("reports not-implemented when no integration is configured", async () => {
    detailsMessage.mockRejectedValue(new RefundHandOffNotImplementedError());

    const result = await processInitStep({ details: detailsJson(), frontPhoto: jpegFile() });

    expect(result.status).toBe("not-implemented");
  });

  it("reports a generic failure, without leaking the cause, when a send throws", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    detailsMessage.mockRejectedValue(new Error("telegram said no, host=internal-9"));

    const result = await processInitStep({ details: detailsJson(), frontPhoto: jpegFile() });

    expect(result).toEqual({
      status: "failed",
      message: "We could not submit your request just now. Please try again in a moment.",
    });
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/internal-9|telegram said no/);
  });
});

describe("processFileStep", () => {
  it("validates and sends one further file under the given reference", async () => {
    const result = await processFileStep({
      reference: "REF-TEST-1",
      slot: "backPhoto",
      file: pngFile(),
    });

    expect(result).toEqual({ status: "accepted", reference: "REF-TEST-1" });
    expect(fileSend).toHaveBeenCalledWith("REF-TEST-1", "backPhoto", expect.any(File));
  });

  it("accepts the video slot", async () => {
    const result = await processFileStep({
      reference: "REF-TEST-1",
      slot: "videoSelfie",
      file: mp4File(),
    });
    expect(result.status).toBe("accepted");
  });

  it("rejects a file of the wrong type for its slot and does not send", async () => {
    const result = await processFileStep({
      reference: "REF-TEST-1",
      slot: "videoSelfie",
      file: jpegFile(),
    });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.fieldErrors.videoSelfie).toBeDefined();
    expect(fileSend).not.toHaveBeenCalled();
  });
});

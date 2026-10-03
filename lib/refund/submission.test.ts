// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processRefundSubmission, validateRefundSubmission } from "./submission";
import { handOffRefundSubmission } from "./submission-handoff";
import { heicFile, jpegFile, mp4File, pdfFile, pngFile } from "@/test/fixtures/media";

/**
 * The hand-off is replaced, but the real module is kept underneath so
 * `RefundHandOffNotImplementedError` stays the same class — `instanceof` in
 * `processRefundSubmission` depends on it.
 */
vi.mock("./submission-handoff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./submission-handoff")>();
  return { ...actual, handOffRefundSubmission: vi.fn(actual.handOffRefundSubmission) };
});

const handOff = vi.mocked(handOffRefundSubmission);

const VALID_DETAILS = {
  orderNumber: "ORD-48213",
  orderAmount: "49,99",
  fullName: "Maria Rossi",
  email: "Maria@Example.com",
  phone: "+39 02 1234 5678",
  address: "Via Roma 12",
  city: "Milano",
  zipCode: "20121",
  country: "IT",
};

function buildFormData(overrides: Record<string, unknown> = {}) {
  const formData = new FormData();
  const fields: Record<string, unknown> = {
    details: JSON.stringify(VALID_DETAILS),
    frontPhoto: jpegFile(),
    backPhoto: pngFile(),
    videoSelfie: mp4File(),
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    formData.set(key, value as string | Blob);
  }
  return formData;
}

beforeEach(() => {
  handOff.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateRefundSubmission", () => {
  it("produces a validated submission with normalised details and all three files", async () => {
    const result = await validateRefundSubmission(buildFormData());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The schema normalises on the way through — this is what the hand-off sees.
    expect(result.submission.details.orderNumber).toBe("ORD-48213");
    expect(result.submission.details.email).toBe("maria@example.com");
    expect(result.submission.files.frontPhoto.name).toBe("front.jpg");
    expect(result.submission.files.backPhoto.name).toBe("back.png");
    expect(result.submission.files.videoSelfie.name).toBe("selfie.mp4");
  });

  it("re-validates the details rather than trusting the client", async () => {
    const result = await validateRefundSubmission(
      buildFormData({
        details: JSON.stringify({ ...VALID_DETAILS, email: "not-an-email", zipCode: "!!" }),
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors)).toEqual(expect.arrayContaining(["email", "zipCode"]));
  });

  it("rejects a missing file", async () => {
    const result = await validateRefundSubmission(buildFormData({ videoSelfie: undefined }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.videoSelfie?.[0]).toMatch(/video selfie/i);
  });

  it("rejects a file disguised with a valid image MIME type and extension", async () => {
    const disguised = new File([pdfFile().slice()], "front.jpg", { type: "image/jpeg" });
    const result = await validateRefundSubmission(buildFormData({ frontPhoto: disguised }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.frontPhoto?.[0]).toMatch(/does not look like a valid image/i);
  });

  it("accepts a HEIC photo the browser reported without a MIME type", async () => {
    const result = await validateRefundSubmission(buildFormData({ frontPhoto: heicFile() }));
    expect(result.ok).toBe(true);
  });

  it("treats malformed JSON as invalid input instead of throwing", async () => {
    const result = await validateRefundSubmission(buildFormData({ details: "{not json" }));
    expect(result.ok).toBe(false);
  });
});

describe("processRefundSubmission", () => {
  it("reports not-implemented while no integration is wired up", async () => {
    // The real, unreplaced hand-off — the app's default state.
    const result = await processRefundSubmission(buildFormData());

    expect(result.status).toBe("not-implemented");
    if (result.status !== "not-implemented") return;
    // Must not read as a success, and must not imply anything was stored.
    expect(result.message).toMatch(/not connected to a service yet/i);
    expect(JSON.stringify(result)).not.toMatch(/reference/i);
  });

  it("passes the validated submission to the hand-off and returns its reference", async () => {
    handOff.mockResolvedValue({ reference: "INTEGRATION-SUPPLIED-1" });

    const result = await processRefundSubmission(buildFormData());

    expect(result).toEqual({ status: "accepted", reference: "INTEGRATION-SUPPLIED-1" });
    expect(handOff).toHaveBeenCalledTimes(1);

    const submission = handOff.mock.calls[0][0];
    expect(submission.details).toMatchObject({ orderNumber: "ORD-48213", country: "IT" });
    expect(submission.files.frontPhoto.name).toBe("front.jpg");
  });

  it("never reaches the hand-off when validation fails", async () => {
    const result = await processRefundSubmission(
      buildFormData({ details: JSON.stringify({ ...VALID_DETAILS, email: "nope" }) })
    );

    expect(result.status).toBe("invalid");
    expect(handOff).not.toHaveBeenCalled();
  });

  it("reports a generic failure and logs the cause when the hand-off throws", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    handOff.mockRejectedValue(new Error("upstream said no, host=internal-9"));

    const result = await processRefundSubmission(buildFormData());

    expect(result).toEqual({
      status: "failed",
      message: "We could not submit your request just now. Please try again in a moment.",
    });
    // The cause is logged server-side but never returned to the client.
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/internal-9|upstream said no/);
  });

  it("treats a hand-off that returns no usable reference as a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    handOff.mockResolvedValue({ reference: "   " });

    const result = await processRefundSubmission(buildFormData());

    // Answering 201 with a blank reference would leave the confirmation page
    // with nothing to show.
    expect(result.status).toBe("failed");
  });

  it("trims a reference supplied by the integration", async () => {
    handOff.mockResolvedValue({ reference: "  REF-7  " });

    const result = await processRefundSubmission(buildFormData());

    expect(result).toEqual({ status: "accepted", reference: "REF-7" });
  });
});

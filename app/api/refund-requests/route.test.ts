// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";
import { handOffRefundSubmission } from "@/lib/refund/submission-handoff";
import { jpegFile, mp4File, pdfFile, pngFile } from "@/test/fixtures/media";

/**
 * These cover the HTTP contract — status codes and response shape. The
 * validation rules themselves are tested against `processRefundSubmission` in
 * lib/refund/submission.test.ts, so they are not repeated here.
 *
 * The real hand-off module is kept underneath the mock so
 * `RefundHandOffNotImplementedError` stays the same class.
 */
vi.mock("@/lib/refund/submission-handoff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/refund/submission-handoff")>();
  return { ...actual, handOffRefundSubmission: vi.fn(actual.handOffRefundSubmission) };
});

const handOff = vi.mocked(handOffRefundSubmission);

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

/** A minimal stand-in; the handler only reads headers and the body. */
function postRequest(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/refund-requests", {
    method: "POST",
    body,
    headers,
  }) as unknown as NextRequest;
}

/** Letting `Request` build the body sets the multipart boundary correctly. */
const multipartRequest = (formData: FormData) => postRequest(formData);

beforeEach(() => {
  handOff.mockReset();
});

describe("POST /api/refund-requests", () => {
  it("returns 501 while no integration is wired up", async () => {
    // The app's default state. Not 500 — nothing is broken — and emphatically
    // not 201, which would claim the request had been recorded.
    handOff.mockRejectedValue(new (await notImplementedError())());

    const response = await POST(multipartRequest(buildFormData()));

    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body.error.message).toEqual(expect.any(String));
    expect(body).not.toHaveProperty("reference");
  });

  it("returns 201 and the integration's reference once the hand-off succeeds", async () => {
    handOff.mockResolvedValue({ reference: "INTEGRATION-SUPPLIED-1" });

    const response = await POST(multipartRequest(buildFormData()));

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ reference: "INTEGRATION-SUPPLIED-1" });
  });

  it("returns 415 when the body is not multipart", async () => {
    const response = await POST(
      postRequest(JSON.stringify({ details: VALID_DETAILS }), {
        "content-type": "application/json",
      })
    );

    expect(response.status).toBe(415);
    expect((await response.json()).error.message).toMatch(/multipart\/form-data/);
    expect(handOff).not.toHaveBeenCalled();
  });

  it("returns 422 with per-field errors when validation fails", async () => {
    const response = await POST(
      multipartRequest(
        buildFormData({ details: JSON.stringify({ ...VALID_DETAILS, email: "not-an-email" }) })
      )
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.fieldErrors.email).toBeDefined();
    expect(handOff).not.toHaveBeenCalled();
  });

  it("returns 422 when a required file is missing", async () => {
    const response = await POST(multipartRequest(buildFormData({ videoSelfie: undefined })));

    expect(response.status).toBe(422);
    expect((await response.json()).error.fieldErrors.videoSelfie).toBeDefined();
  });

  it("returns 422 when a file's bytes contradict its declared type", async () => {
    const disguised = new File([pdfFile().slice()], "front.jpg", { type: "image/jpeg" });
    const response = await POST(multipartRequest(buildFormData({ frontPhoto: disguised })));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.fieldErrors.frontPhoto?.[0]).toMatch(/does not look like a valid image/i);
  });

  it("returns 500 without leaking internal detail when the hand-off throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    handOff.mockRejectedValue(new Error("upstream refused, host=internal-9"));

    const response = await POST(multipartRequest(buildFormData()));

    expect(response.status).toBe(500);
    const raw = JSON.stringify(await response.json());
    expect(raw).not.toMatch(/internal-9|upstream refused/);
  });
});

/** Imported lazily so the mock factory above is in place first. */
async function notImplementedError() {
  const { RefundHandOffNotImplementedError } = await import("@/lib/refund/submission-handoff");
  return RefundHandOffNotImplementedError;
}

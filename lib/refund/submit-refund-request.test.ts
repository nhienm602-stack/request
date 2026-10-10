import { afterEach, describe, expect, it, vi } from "vitest";
import { submitRefundRequest } from "./submit-refund-request";
import { REFUND_SUBMISSION_ENDPOINT } from "./submission-contract";
import { refundDetailsSchema } from "./details-schema";
import { jpegFile, mp4File, pngFile } from "@/test/fixtures/media";

const DETAILS = refundDetailsSchema.parse({
  orderNumber: "ORD-48213",
  orderAmount: "49,99",
  fullName: "Maria Rossi",
  email: "maria@example.com",
  phone: "+39 02 1234 5678",
  address: "Via Roma 12",
  city: "Milano",
  zipCode: "20121",
  country: "IT",
});

const FILES = {
  frontPhoto: jpegFile(),
  backPhoto: pngFile(),
  videoSelfie: mp4File(),
};

/**
 * `make` is called afresh for every request, so each gets its own `Response`
 * (a body can only be read once). `call` is the zero-based request index, which
 * lets a test fail a specific step.
 */
function mockFetch(make: (call: number) => Response | Error) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const result = make(call++);
    if (result instanceof Error) throw result;
    return result;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const accepted = (reference: string) => () => jsonResponse(201, { reference });

/** The FormData bodies of each request made, in order. */
function sentBodies(fetchMock: ReturnType<typeof mockFetch>): FormData[] {
  const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>;
  return calls.map((call) => call[1].body as FormData);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("submitRefundRequest", () => {
  it("uploads details + each file as its own small request, off one call", async () => {
    const fetchMock = mockFetch(accepted("RF-ABCD-2345"));

    const result = await submitRefundRequest(DETAILS, FILES);

    expect(result).toEqual({ status: "success", reference: "RF-ABCD-2345" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(REFUND_SUBMISSION_ENDPOINT);
    expect(init.method).toBe("POST");
    // The browser must set the multipart boundary itself; an explicit
    // Content-Type here would produce an unparseable body.
    expect(init.headers).toBeUndefined();

    const [first, second, third] = sentBodies(fetchMock);

    // 1) init: details JSON + the first photo, no reference yet.
    expect(first.get("step")).toBe("init");
    expect(JSON.parse(String(first.get("details")))).toMatchObject({ orderNumber: "ORD-48213" });
    expect((first.get("frontPhoto") as File).name).toBe("front.jpg");

    // 2) back photo, carrying the reference from step 1.
    expect(second.get("step")).toBe("file");
    expect(second.get("slot")).toBe("backPhoto");
    expect(second.get("reference")).toBe("RF-ABCD-2345");
    expect((second.get("backPhoto") as File).name).toBe("back.png");

    // 3) video selfie.
    expect(third.get("slot")).toBe("videoSelfie");
    expect((third.get("videoSelfie") as File).name).toBe("selfie.mp4");
  });

  it("maps a 4xx on the first step onto field errors, with no progress to resume", async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(422, {
        error: { message: "Check the fields.", fieldErrors: { frontPhoto: ["Too large."] } },
      })
    );

    const result = await submitRefundRequest(DETAILS, FILES);

    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { frontPhoto: ["Too large."] },
      formError: "Check the fields.",
      progress: { reference: null, uploadedSlots: [] },
    });
    // It stops at the failed step rather than sending the rest.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a 5xx as retryable rather than a field problem", async () => {
    mockFetch(() => jsonResponse(500, { error: { message: "Try again shortly." } }));

    const result = await submitRefundRequest(DETAILS, FILES);

    expect(result).toMatchObject({ status: "error", formError: "Try again shortly." });
  });

  it("reports a network failure without throwing", async () => {
    mockFetch(() => new TypeError("Failed to fetch"));

    const result = await submitRefundRequest(DETAILS, FILES);

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.formError).toMatch(/could not reach the server/i);
  });

  it("survives a non-JSON response body", async () => {
    // A proxy or gateway can return an HTML error page; parsing must not throw.
    mockFetch(() => new Response("<html>502 Bad Gateway</html>", { status: 502 }));

    const result = await submitRefundRequest(DETAILS, FILES);

    expect(result.status).toBe("error");
  });

  it("does not report success on a 2xx body that lacks a reference", async () => {
    mockFetch(() => jsonResponse(200, { unexpected: true }));

    const result = await submitRefundRequest(DETAILS, FILES);

    expect(result.status).not.toBe("success");
  });

  it("resumes from prior progress, re-sending only the outstanding files", async () => {
    const fetchMock = mockFetch(accepted("RF-ABCD-2345"));

    const result = await submitRefundRequest(DETAILS, FILES, {
      progress: { reference: "RF-ABCD-2345", uploadedSlots: ["frontPhoto", "backPhoto"] },
    });

    expect(result).toEqual({ status: "success", reference: "RF-ABCD-2345" });
    // Only the video is left to send — init and the photos are skipped.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBodies(fetchMock)[0].get("slot")).toBe("videoSelfie");
  });

  it("after a failed video, a retry sends just the video (no duplicate photos)", async () => {
    // init + back succeed; the video (3rd request) fails.
    const fetchMock = mockFetch((call) =>
      call < 2 ? jsonResponse(201, { reference: "RF-X" }) : jsonResponse(500, { error: { message: "later" } })
    );

    const first = await submitRefundRequest(DETAILS, FILES);

    expect(first.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    if (first.status !== "error") return;
    expect(first.progress).toEqual({ reference: "RF-X", uploadedSlots: ["frontPhoto", "backPhoto"] });

    vi.unstubAllGlobals();
    const retryMock = mockFetch(accepted("RF-X"));

    const second = await submitRefundRequest(DETAILS, FILES, { progress: first.progress });

    expect(second).toEqual({ status: "success", reference: "RF-X" });
    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(sentBodies(retryMock)[0].get("slot")).toBe("videoSelfie");
  });
});

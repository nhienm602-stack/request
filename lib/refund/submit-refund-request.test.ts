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

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("submitRefundRequest", () => {
  it("posts multipart form data to the internal endpoint", async () => {
    const fetchMock = mockFetch(jsonResponse(201, { reference: "RF-ABCD-2345" }));

    const result = await submitRefundRequest(DETAILS, FILES);

    expect(result).toEqual({ status: "success", reference: "RF-ABCD-2345" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(REFUND_SUBMISSION_ENDPOINT);
    expect(init.method).toBe("POST");
    // The browser must set the multipart boundary itself; an explicit
    // Content-Type here would produce an unparseable body.
    expect(init.headers).toBeUndefined();

    const body = init.body as FormData;
    expect(JSON.parse(String(body.get("details")))).toMatchObject({ orderNumber: "ORD-48213" });
    expect((body.get("frontPhoto") as File).name).toBe("front.jpg");
    expect((body.get("backPhoto") as File).name).toBe("back.png");
    expect((body.get("videoSelfie") as File).name).toBe("selfie.mp4");
  });

  it("maps a 4xx response onto field errors", async () => {
    mockFetch(
      jsonResponse(422, {
        error: { message: "Check the fields.", fieldErrors: { frontPhoto: ["Too large."] } },
      })
    );

    const result = await submitRefundRequest(DETAILS, FILES);

    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { frontPhoto: ["Too large."] },
      formError: "Check the fields.",
    });
  });

  it("treats a 5xx response as retryable rather than a field problem", async () => {
    mockFetch(jsonResponse(500, { error: { message: "Try again shortly." } }));

    const result = await submitRefundRequest(DETAILS, FILES);

    expect(result).toEqual({ status: "error", formError: "Try again shortly." });
  });

  it("reports a network failure without throwing", async () => {
    mockFetch(new TypeError("Failed to fetch"));

    const result = await submitRefundRequest(DETAILS, FILES);

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.formError).toMatch(/could not reach the server/i);
  });

  it("survives a non-JSON response body", async () => {
    // A proxy or gateway can return an HTML error page; parsing must not throw.
    mockFetch(new Response("<html>502 Bad Gateway</html>", { status: 502 }));

    const result = await submitRefundRequest(DETAILS, FILES);

    expect(result.status).toBe("error");
  });

  it("does not report success on a 2xx body that lacks a reference", async () => {
    mockFetch(jsonResponse(200, { unexpected: true }));

    const result = await submitRefundRequest(DETAILS, FILES);

    expect(result.status).not.toBe("success");
  });
});

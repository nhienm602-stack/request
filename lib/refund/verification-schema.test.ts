import { describe, expect, it } from "vitest";
import { verificationSchema } from "./verification-schema";
import { PHOTO_CONSTRAINTS, VIDEO_CONSTRAINTS } from "./media";

/**
 * Builds a stand-in for a picked file. The schema duck-types rather than using
 * `instanceof File` precisely so this is possible without allocating real bytes
 * — a 51MB `File` would make the over-size test unbearably slow.
 */
function fakeFile(name: string, type: string, size: number): File {
  return { name, type, size } as File;
}

const validPhoto = () => fakeFile("front.jpg", "image/jpeg", 2_000_000);
const validVideo = () => fakeFile("selfie.mp4", "video/mp4", 8_000_000);

const VALID = {
  frontPhoto: validPhoto(),
  backPhoto: fakeFile("back.png", "image/png", 1_500_000),
  videoSelfie: validVideo(),
};

function errorFor(overrides: Record<string, unknown>, field: string) {
  const result = verificationSchema.safeParse({ ...VALID, ...overrides });
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("verificationSchema", () => {
  it("accepts three well-formed files", () => {
    expect(verificationSchema.safeParse(VALID).success).toBe(true);
  });

  it.each(["frontPhoto", "backPhoto", "videoSelfie"] as const)("requires %s", (field) => {
    expect(errorFor({ [field]: null }, field)).toBeDefined();
  });

  it("rejects a photo above the size limit", () => {
    const tooBig = fakeFile("front.jpg", "image/jpeg", PHOTO_CONSTRAINTS.maxBytes + 1);
    expect(errorFor({ frontPhoto: tooBig }, "frontPhoto")).toMatch(/10 MB or smaller/);
  });

  it("rejects a video above the size limit", () => {
    const tooBig = fakeFile("selfie.mp4", "video/mp4", VIDEO_CONSTRAINTS.maxBytes + 1);
    expect(errorFor({ videoSelfie: tooBig }, "videoSelfie")).toMatch(/50 MB or smaller/);
  });

  it("rejects an empty file", () => {
    expect(errorFor({ frontPhoto: fakeFile("front.jpg", "image/jpeg", 0) }, "frontPhoto")).toMatch(
      /empty/
    );
  });

  it("rejects a disallowed image format", () => {
    expect(errorFor({ frontPhoto: fakeFile("doc.pdf", "application/pdf", 100) }, "frontPhoto"))
      .toMatch(/JPG, PNG or HEIC/);
  });

  it("rejects a photo uploaded into the video field", () => {
    expect(errorFor({ videoSelfie: validPhoto() }, "videoSelfie")).toMatch(/MP4, MOV or WebM/);
  });

  it("accepts HEIC by extension when the browser reports no MIME type", () => {
    // iOS Safari and several Android camera apps report "" for HEIC/HEIF.
    const heic = fakeFile("IMG_0042.HEIC", "", 3_000_000);
    expect(errorFor({ frontPhoto: heic }, "frontPhoto")).toBeUndefined();
  });

  it("still rejects an unknown extension when the MIME type is missing", () => {
    const exe = fakeFile("payload.exe", "", 3_000_000);
    expect(errorFor({ frontPhoto: exe }, "frontPhoto")).toMatch(/JPG, PNG or HEIC/);
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  SIGNATURE_SAMPLE_BYTES,
  detectBlobKind,
  detectFileKind,
} from "./file-signature";

/** Builds an ISO-BMFF header with the given four-character brand. */
function isoBmff(brand: string): Uint8Array {
  const bytes = new Uint8Array(SIGNATURE_SAMPLE_BYTES);
  bytes.set([0x00, 0x00, 0x00, 0x18], 0);
  bytes.set([..."ftyp"].map((c) => c.charCodeAt(0)), 4);
  bytes.set([...brand].map((c) => c.charCodeAt(0)), 8);
  return bytes;
}

function withPrefix(prefix: number[]): Uint8Array {
  const bytes = new Uint8Array(SIGNATURE_SAMPLE_BYTES);
  bytes.set(prefix, 0);
  return bytes;
}

describe("detectFileKind", () => {
  it("detects JPEG", () => {
    expect(detectFileKind(withPrefix([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
  });

  it("detects PNG", () => {
    expect(detectFileKind(withPrefix([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "png"
    );
  });

  it("detects WebM / Matroska", () => {
    expect(detectFileKind(withPrefix([0x1a, 0x45, 0xdf, 0xa3]))).toBe("webm");
  });

  it.each(["heic", "heix", "mif1", "hevc"])("detects HEIF brand %s", (brand) => {
    expect(detectFileKind(isoBmff(brand))).toBe("heic");
  });

  it.each(["isom", "mp42", "avc1", "dash"])("detects MP4 brand %s", (brand) => {
    expect(detectFileKind(isoBmff(brand))).toBe("mp4");
  });

  it("detects QuickTime", () => {
    expect(detectFileKind(isoBmff("qt  "))).toBe("quicktime");
  });

  it("separates HEIC from MP4 despite the shared container", () => {
    // Both are ISO-BMFF; only the brand distinguishes a photo from a video.
    expect(detectFileKind(isoBmff("heic"))).toBe("heic");
    expect(detectFileKind(isoBmff("isom"))).toBe("mp4");
  });

  it("rejects an unlisted ISO-BMFF brand rather than assuming MP4", () => {
    expect(detectFileKind(isoBmff("xxxx"))).toBeNull();
  });

  it.each([
    ["a PDF", [0x25, 0x50, 0x44, 0x46]],
    ["a Windows executable", [0x4d, 0x5a, 0x90, 0x00]],
    ["a ZIP archive", [0x50, 0x4b, 0x03, 0x04]],
    ["an ELF binary", [0x7f, 0x45, 0x4c, 0x46]],
  ])("rejects %s", (_label, prefix) => {
    expect(detectFileKind(withPrefix(prefix))).toBeNull();
  });

  it("rejects an empty or truncated file", () => {
    expect(detectFileKind(new Uint8Array(0))).toBeNull();
    expect(detectFileKind(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it("is not fooled by a signature that appears later in the file", () => {
    // A real JPEG starts with FFD8FF; a file merely containing those bytes
    // further in does not.
    const bytes = new Uint8Array(SIGNATURE_SAMPLE_BYTES);
    bytes.set([0x00, 0x00, 0xff, 0xd8, 0xff], 0);
    expect(detectFileKind(bytes)).toBeNull();
  });
});

describe("detectBlobKind", () => {
  it("reads only the head of the blob", async () => {
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), new Uint8Array(10_000)], {
      type: "image/jpeg",
    });
    expect(await detectBlobKind(jpeg)).toBe("jpeg");
  });

  it("ignores the declared MIME type", async () => {
    // A PDF relabelled as an image is exactly the case this check exists for.
    const liar = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: "image/jpeg" });
    expect(await detectBlobKind(liar)).toBeNull();
  });
});

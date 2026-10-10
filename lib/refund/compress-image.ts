/**
 * Best-effort client-side image shrinking, so a phone photo fits inside one
 * upload request (see submission-contract.ts for why requests must stay small).
 *
 * It is deliberately forgiving: anything it cannot decode or re-encode — HEIC,
 * which most browsers can't draw to a canvas, or a run in an environment with
 * no canvas at all — is returned unchanged. The server's size limit is the real
 * guarantee; this only reduces how often a user trips it.
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.72;

export async function compressImage(file: File): Promise<File> {
  // Only formats a canvas can reliably decode. HEIC/HEIF pass through untouched.
  if (file.type !== "image/jpeg" && file.type !== "image/png") return file;

  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
      return file;
    }

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close?.();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    // No gain (or failed) → keep the original rather than risk a larger file.
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.(png|jpe?g)$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_DIMENSION = 4000;

export class UploadValidationError extends Error {
  readonly statusCode = 400;
}

/**
 * Decodes the upload with sharp (so the bytes must be a real image, whatever the file name or
 * client-reported MIME type says), strips metadata (EXIF/GPS), bounds the dimensions and re-encodes
 * as WebP. Anything that is not a decodable JPEG/PNG/WebP is rejected.
 */
export async function toSafeWebp(input: Buffer): Promise<Buffer> {
  if (input.length === 0) throw new UploadValidationError("Empty file");
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(
      `Image is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`,
    );
  }
  const sharp = (await import("sharp")).default;
  try {
    const image = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 });
    const meta = await image.metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
      throw new UploadValidationError("Unsupported file format. Use JPG, PNG or WebP.");
    }
    return await image
      .rotate() // honour EXIF orientation before metadata is dropped
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();
  } catch (err) {
    if (err instanceof UploadValidationError) throw err;
    throw new UploadValidationError("The file is not a valid image");
  }
}

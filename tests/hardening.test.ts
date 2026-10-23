import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { calculateDiscountAmount } from "../server/lib/discounts";
import { escapeHtml } from "../server/lib/security";
import { toSafeWebp, UploadValidationError, MAX_UPLOAD_BYTES } from "../server/lib/image-upload";

test("discount: percentage clamped to 100% and never exceeds subtotal", () => {
  assert.equal(calculateDiscountAmount(100, "percentage", 10), 10);
  assert.equal(calculateDiscountAmount(100, "percentage", 250), 100);
  assert.equal(calculateDiscountAmount(100, "percentage", -5), 0);
});
test("discount: fixed coupon larger than subtotal cannot make total negative", () => {
  assert.equal(calculateDiscountAmount(40, "fixed", 500), 40);
  assert.equal(calculateDiscountAmount(40, "fixed", 15.555), 15.56);
});
test("discount: garbage in -> zero out", () => {
  assert.equal(calculateDiscountAmount(100, "percentage", NaN), 0);
  assert.equal(calculateDiscountAmount(-10, "fixed", 5), 0);
  assert.equal(calculateDiscountAmount(100, "bogus", 5), 0);
  assert.equal(calculateDiscountAmount(100, null, null), 0);
});

test("escapeHtml neutralises markup", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  assert.equal(escapeHtml(null), "");
});

test("upload: real PNG is accepted and re-encoded to webp", async () => {
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#aaa" } }).png().toBuffer();
  const out = await toSafeWebp(png);
  assert.equal((await sharp(out).metadata()).format, "webp");
});
test("upload: webp is re-encoded too (previously stored raw)", async () => {
  const webp = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#aaa" } }).webp().toBuffer();
  assert.equal((await sharp(await toSafeWebp(webp)).metadata()).format, "webp");
});
test("upload: HTML/script disguised as .webp is rejected", async () => {
  await assert.rejects(toSafeWebp(Buffer.from("<html><script>alert(1)</script></html>")), UploadValidationError);
});
test("upload: SVG (XSS vector) is rejected", async () => {
  await assert.rejects(toSafeWebp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')), UploadValidationError);
});
test("upload: GIF is rejected (only jpeg/png/webp)", async () => {
  const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).gif().toBuffer();
  await assert.rejects(toSafeWebp(gif), UploadValidationError);
});
test("upload: oversized file is rejected before decoding", async () => {
  await assert.rejects(toSafeWebp(Buffer.alloc(MAX_UPLOAD_BYTES + 1)), /too large/);
});
test("upload: EXIF/GPS metadata is stripped", async () => {
  const withExif = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#aaa" } })
    .withMetadata({ exif: { IFD0: { Copyright: "secret-gps" } } }).jpeg().toBuffer();
  const out = await toSafeWebp(withExif);
  assert.equal((await sharp(out).metadata()).exif, undefined);
});

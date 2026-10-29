export type ImageType = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

/** Detects the real image type from magic bytes. Never trust the client supplied MIME type. */
export function detectImageType(buf: Uint8Array): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (
    buf.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b)
  )
    return { mime: "image/png", ext: "png" };
  if (
    buf.length >= 12 &&
    String.fromCharCode(...buf.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...buf.subarray(8, 12)) === "WEBP"
  )
    return { mime: "image/webp", ext: "webp" };
  return null;
}

/** Reads pixel dimensions from PNG / JPEG / WebP headers (best effort). */
export function imageSize(buf: Uint8Array, type: ImageType["ext"]): { width: number; height: number } | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  try {
    if (type === "png") return { width: dv.getUint32(16), height: dv.getUint32(20) };
    if (type === "jpg") {
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) return null;
        const marker = buf[off + 1];
        const len = dv.getUint16(off + 2);
        // SOF0..SOF15 excluding DHT(C4), JPG(C8), DAC(CC)
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: dv.getUint16(off + 5), width: dv.getUint16(off + 7) };
        }
        off += 2 + len;
      }
      return null;
    }
    if (type === "webp") {
      const chunk = String.fromCharCode(...buf.subarray(12, 16));
      if (chunk === "VP8 ") return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
      if (chunk === "VP8L") {
        const b = dv.getUint32(21, true);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8X") {
        const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
        const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
        return { width: w, height: h };
      }
    }
  } catch {
    return null;
  }
  return null;
}

import { describe, expect, it } from "vitest";
import { detectImageType, imageSize } from "@/lib/image";

// 1x1 PNG
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));

describe("image validation", () => {
  it("detects PNG by magic bytes and reads its size", () => {
    expect(detectImageType(png)).toEqual({ mime: "image/png", ext: "png" });
    expect(imageSize(png, "png")).toEqual({ width: 1, height: 1 });
  });
  it("detects JPEG and WebP signatures", () => {
    expect(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.ext).toBe("jpg");
    const webp = new Uint8Array(16);
    webp.set(Buffer.from("RIFF"), 0);
    webp.set(Buffer.from("WEBP"), 8);
    expect(detectImageType(webp)?.ext).toBe("webp");
  });
  it("rejects non-images even if renamed", () => {
    expect(detectImageType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(detectImageType(Buffer.from("GIF89a......"))).toBeNull();
  });
});

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { HttpError, json, route } from "@/lib/api";
import { Media } from "@/lib/models";
import { env } from "@/lib/env";
import { detectImageType, imageSize } from "@/lib/image";

export const GET = route(async () => {
  const items = await Media.find().sort({ createdAt: -1 }).lean();
  return json({ items });
});

export const POST = route(async (req) => {
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected multipart/form-data");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No image uploaded");
  if (file.size === 0) throw new HttpError(400, "The file is empty");
  if (file.size > env.maxUploadBytes) {
    throw new HttpError(413, `Image must be under ${env.maxUploadBytes / 1024 / 1024} MB`);
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(buf);
  if (!type) throw new HttpError(415, "Only JPEG, PNG or WebP images are allowed");
  const dims = imageSize(buf, type.ext);
  if (dims && (dims.width > 10000 || dims.height > 10000)) throw new HttpError(400, "Image dimensions are too large");

  // Random server-side name: the original filename is never used as a path.
  const fileName = `${crypto.randomUUID()}.${type.ext}`;
  await fs.mkdir(env.uploadDir, { recursive: true });
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ env.uploadDir, fileName), buf);

  const originalName = (file.name || "image").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const item = await Media.create({
    fileName,
    originalName,
    mimeType: type.mime,
    size: buf.byteLength,
    width: dims?.width,
    height: dims?.height,
  });
  return json({ item }, 201);
});

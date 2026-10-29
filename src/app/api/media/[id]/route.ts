import fs from "node:fs/promises";
import path from "node:path";
import { HttpError, json, objectId, route } from "@/lib/api";
import { Campaign, Media, Template } from "@/lib/models";
import { env } from "@/lib/env";

type Ctx = { params: Promise<{ id: string }> };

function filePath(fileName: string) {
  const p = path.resolve(env.uploadDir, fileName);
  if (!p.startsWith(path.resolve(env.uploadDir) + path.sep)) throw new HttpError(400, "Invalid file path");
  return p;
}

/** Streams the image (admin only). */
export const GET = route<Ctx>(async (_req, { params }) => {
  const media = await Media.findById(objectId((await params).id)).lean();
  if (!media) throw new HttpError(404, "Image not found");
  const data = await fs.readFile(filePath(media.fileName)).catch(() => {
    throw new HttpError(404, "Image file is missing on disk");
  });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(data.byteLength),
      "Cache-Control": "private, max-age=86400",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const id = objectId((await params).id);
  const media = await Media.findById(id).lean();
  if (!media) throw new HttpError(404, "Image not found");
  const inUse = await Campaign.exists({ mediaId: id, status: { $in: ["running", "paused", "draft"] } });
  if (inUse) throw new HttpError(409, "This image is used by an active or draft campaign");
  await Template.updateMany({ mediaId: id }, { $set: { mediaId: null } });
  await Media.deleteOne({ _id: id });
  await fs.rm(filePath(media.fileName), { force: true });
  return json({ ok: true });
});

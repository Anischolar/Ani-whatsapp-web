import { z } from "zod";
import { HttpError } from "./api";
import { Media } from "./models";

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1, "Message text is required").max(4096),
  mediaId: z.string().nullable().optional(),
});

export async function assertMedia(mediaId: string | null | undefined) {
  if (!mediaId) return null;
  if (!(await Media.exists({ _id: mediaId }))) throw new HttpError(400, "Selected image no longer exists");
  return mediaId;
}

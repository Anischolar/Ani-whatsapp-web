import { json, readJson, route } from "@/lib/api";
import { Template } from "@/lib/models";
import { assertMedia, templateSchema } from "@/lib/validation";

export const GET = route(async () => {
  const items = await Template.find().sort({ updatedAt: -1 }).lean();
  return json({ items });
});

export const POST = route(async (req) => {
  const data = templateSchema.parse(await readJson(req));
  const item = await Template.create({ ...data, mediaId: await assertMedia(data.mediaId) });
  return json({ item }, 201);
});

import { HttpError, json, objectId, readJson, route } from "@/lib/api";
import { Template } from "@/lib/models";
import { assertMedia, templateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route<Ctx>(async (req, { params }) => {
  const id = objectId((await params).id);
  const data = templateSchema.parse(await readJson(req));
  const item = await Template.findByIdAndUpdate(
    id,
    { ...data, mediaId: await assertMedia(data.mediaId) },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!item) throw new HttpError(404, "Template not found");
  return json({ item });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const res = await Template.deleteOne({ _id: objectId((await params).id) });
  if (!res.deletedCount) throw new HttpError(404, "Template not found");
  return json({ ok: true });
});

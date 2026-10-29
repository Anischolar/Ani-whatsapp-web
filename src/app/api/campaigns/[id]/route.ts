import { HttpError, json, objectId, readJson, route } from "@/lib/api";
import { Campaign, Media, MessageLog } from "@/lib/models";
import { campaignStats, worker } from "@/lib/queue";
import { campaignSchema, normalizeCampaignInput } from "@/lib/campaigns";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const id = objectId((await params).id);
  const item = await Campaign.findById(id).lean();
  if (!item) throw new HttpError(404, "Campaign not found");
  const [stats, media] = await Promise.all([
    campaignStats([id]),
    item.mediaId ? Media.findById(item.mediaId).lean() : null,
  ]);
  return json({ item: { ...item, stats: stats.get(String(id)), media }, worker: worker.status });
});

export const PUT = route<Ctx>(async (req, { params }) => {
  const id = objectId((await params).id);
  const data = await normalizeCampaignInput(campaignSchema.parse(await readJson(req)));
  const item = await Campaign.findOneAndUpdate({ _id: id, status: "draft" }, data, { returnDocument: "after" }).lean();
  if (!item) throw new HttpError(409, "Only draft campaigns can be edited");
  return json({ item });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const id = objectId((await params).id);
  const campaign = await Campaign.findById(id).lean();
  if (!campaign) throw new HttpError(404, "Campaign not found");
  if (campaign.status === "running") throw new HttpError(409, "Pause or cancel the campaign before deleting it");
  await MessageLog.deleteMany({ campaignId: id });
  await Campaign.deleteOne({ _id: id });
  return json({ ok: true });
});

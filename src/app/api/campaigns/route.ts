import { json, readJson, route } from "@/lib/api";
import { Campaign } from "@/lib/models";
import { campaignStats } from "@/lib/queue";
import { campaignSchema, normalizeCampaignInput, startCampaign } from "@/lib/campaigns";
import { z } from "zod";

export const GET = route(async () => {
  const items = await Campaign.find().sort({ createdAt: -1 }).limit(200).lean();
  const stats = await campaignStats(items.map((c) => c._id));
  return json({ items: items.map((c) => ({ ...c, stats: stats.get(String(c._id)) })) });
});

export const POST = route(async (req) => {
  const raw = (await readJson(req)) as Record<string, unknown>;
  const startNow = z.boolean().default(false).parse(raw?.startNow);
  const data = await normalizeCampaignInput(campaignSchema.parse(raw));
  const campaign = await Campaign.create({ ...data, status: "draft" });
  let total = 0;
  if (startNow) total = await startCampaign(campaign._id);
  return json({ item: await Campaign.findById(campaign._id).lean(), total }, 201);
});

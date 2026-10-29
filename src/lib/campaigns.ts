import { z } from "zod";
import { HttpError } from "./api";
import { Campaign, Template } from "./models";
import { assertMedia } from "./validation";
import { enqueueCampaign, worker } from "./queue";
import type mongoose from "mongoose";

export const campaignSchema = z
  .object({
    name: z.string().trim().min(1, "Campaign name is required").max(120),
    templateId: z.string().nullable().optional(),
    body: z.string().trim().min(1, "Message text is required").max(4096),
    mediaId: z.string().nullable().optional(),
    audienceTags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(50).default([]),
    minDelaySec: z.number().int().min(3, "Minimum delay is 3 seconds").max(600),
    maxDelaySec: z.number().int().min(3).max(900),
    appendOptOutFooter: z.boolean().default(true),
  })
  .refine((d) => d.maxDelaySec >= d.minDelaySec, { message: "Max delay must be ≥ min delay", path: ["maxDelaySec"] });

export async function normalizeCampaignInput(data: z.infer<typeof campaignSchema>) {
  const templateId = data.templateId && (await Template.exists({ _id: data.templateId })) ? data.templateId : null;
  return { ...data, templateId, mediaId: await assertMedia(data.mediaId) };
}

export async function startCampaign(id: mongoose.Types.ObjectId) {
  const campaign = await Campaign.findOneAndUpdate(
    { _id: id, status: "draft" },
    { $set: { status: "paused", lastError: "" } }, // hold while the queue is built
    { returnDocument: "after" },
  );
  if (!campaign) throw new HttpError(409, "Only draft campaigns can be started");
  const total = await enqueueCampaign(campaign._id, campaign.audienceTags);
  if (total === 0) {
    await Campaign.updateOne({ _id: id }, { $set: { status: "draft" } });
    throw new HttpError(400, "No opted-in contacts match this audience");
  }
  await Campaign.updateOne({ _id: id }, { $set: { status: "running", total, startedAt: new Date() } });
  worker.kick();
  return total;
}

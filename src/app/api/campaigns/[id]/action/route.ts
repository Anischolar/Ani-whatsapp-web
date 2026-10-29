import { z } from "zod";
import { HttpError, json, objectId, readJson, route } from "@/lib/api";
import { Campaign, MessageLog, type CampaignStatus } from "@/lib/models";
import { startCampaign } from "@/lib/campaigns";
import { worker } from "@/lib/queue";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ action: z.enum(["start", "pause", "resume", "cancel", "retry_failed"]) });

export const POST = route<Ctx>(async (req, { params }) => {
  const id = objectId((await params).id);
  const { action } = schema.parse(await readJson(req));
  const campaign = await Campaign.findById(id).lean();
  if (!campaign) throw new HttpError(404, "Campaign not found");

  const transition = async (from: CampaignStatus[], to: CampaignStatus, extra: Record<string, unknown> = {}) => {
    const res = await Campaign.updateOne({ _id: id, status: { $in: from } }, { $set: { status: to, ...extra } });
    if (!res.modifiedCount) throw new HttpError(409, `Cannot ${action.replace("_", " ")} a ${campaign.status} campaign`);
  };

  switch (action) {
    case "start":
      await startCampaign(id);
      break;
    case "pause":
      await transition(["running"], "paused");
      break;
    case "resume":
      await transition(["paused"], "running", { lastError: "" });
      worker.kick();
      break;
    case "cancel":
      await transition(["running", "paused"], "cancelled", { completedAt: new Date() });
      await MessageLog.updateMany({ campaignId: id, status: "pending" }, { $set: { status: "skipped", error: "Campaign cancelled" } });
      break;
    case "retry_failed": {
      if (campaign.status === "draft") throw new HttpError(409, "Campaign has not been started");
      const res = await MessageLog.updateMany(
        { campaignId: id, status: "failed" },
        { $set: { status: "pending", error: "" } },
      );
      if (!res.modifiedCount) throw new HttpError(400, "There are no failed messages to retry");
      await Campaign.updateOne({ _id: id }, { $set: { status: "running", lastError: "" }, $unset: { completedAt: 1 } });
      worker.kick();
      break;
    }
  }
  return json({ item: await Campaign.findById(id).lean() });
});

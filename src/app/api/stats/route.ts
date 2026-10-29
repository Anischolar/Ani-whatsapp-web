import { json, route } from "@/lib/api";
import { Campaign, Contact, MessageLog, Template } from "@/lib/models";
import { whatsapp } from "@/lib/whatsapp";
import { worker } from "@/lib/queue";
import { env } from "@/lib/env";

export const GET = route(async () => {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [consent, campaigns, templates, sent24h, failed24h, recent] = await Promise.all([
    Contact.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$consentStatus", n: { $sum: 1 } } }]),
    Campaign.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Template.countDocuments(),
    MessageLog.countDocuments({ status: "sent", sentAt: { $gte: since } }),
    MessageLog.countDocuments({ status: "failed", updatedAt: { $gte: since } }),
    Campaign.find().sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  const toObj = (rows: { _id: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
  return json({
    contacts: toObj(consent),
    campaigns: toObj(campaigns),
    templates,
    sent24h,
    failed24h,
    dailyLimit: env.dailySendLimit,
    recentCampaigns: recent,
    whatsapp: whatsapp.state.status,
    worker: worker.status,
  });
});

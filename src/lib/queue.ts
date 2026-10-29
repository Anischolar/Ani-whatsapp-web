import path from "node:path";
import fs from "node:fs";
import { Campaign, Contact, Media, MessageLog, OptOut } from "./models";
import { audienceFilter } from "./consent";
import { renderTemplate, withFooter } from "./template";
import { whatsapp } from "./whatsapp";
import { env } from "./env";
import type mongoose from "mongoose";

const IDLE_MS = 3000;

class CampaignWorker {
  private running = false;
  private wake: (() => void) | null = null;
  status: { state: "idle" | "sending" | "waiting_whatsapp" | "daily_limit" | "throttle"; detail: string } = {
    state: "idle",
    detail: "",
  };

  start() {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  /** Wake the worker from an idle wait (e.g. after a campaign is started or resumed). */
  kick() {
    this.wake?.();
  }

  private idle(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        resolve();
      }
      this.wake = done;
    });
  }

  private async loop() {
    while (this.running) {
      try {
        const worked = await this.tick();
        if (!worked) await this.idle(IDLE_MS);
      } catch (err) {
        console.error("[queue] tick failed", err);
        await this.idle(IDLE_MS * 3);
      }
    }
  }

  /** Processes at most one message. Returns true when something was attempted. */
  private async tick(): Promise<boolean> {
    const campaign = await Campaign.findOne({ status: "running" }).sort({ startedAt: 1 });
    if (!campaign) {
      this.status = { state: "idle", detail: "" };
      return false;
    }
    if (!whatsapp.isReady) {
      this.status = { state: "waiting_whatsapp", detail: "Waiting for WhatsApp to connect" };
      return false;
    }
    if (env.dailySendLimit > 0) {
      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const sent = await MessageLog.countDocuments({ status: "sent", sentAt: { $gte: since } });
      if (sent >= env.dailySendLimit) {
        this.status = { state: "daily_limit", detail: `Daily limit of ${env.dailySendLimit} messages reached` };
        await this.idle(60_000);
        return false;
      }
    }

    const log = await MessageLog.findOneAndUpdate(
      { campaignId: campaign._id, status: "pending" },
      { $set: { status: "sending" }, $inc: { attempts: 1 } },
      { sort: { _id: 1 }, returnDocument: "after" },
    );
    if (!log) {
      const sending = await MessageLog.exists({ campaignId: campaign._id, status: "sending" });
      if (!sending) {
        await Campaign.updateOne(
          { _id: campaign._id, status: "running" },
          { $set: { status: "completed", completedAt: new Date() } },
        );
        console.log(`[queue] campaign ${campaign.name} completed`);
      }
      return false;
    }

    this.status = { state: "sending", detail: `${campaign.name} → +${log.phone}` };
    await this.deliver(campaign, log);

    const min = Math.max(1, campaign.minDelaySec);
    const max = Math.max(min, campaign.maxDelaySec);
    const delay = (min + Math.random() * (max - min)) * 1000;
    this.status = { state: "throttle", detail: `Next message in ${Math.round(delay / 1000)}s` };
    // Throttle delay is deliberately not interruptible by kick().
    await new Promise((r) => setTimeout(r, delay));
    return true;
  }

  private async deliver(
    campaign: mongoose.HydratedDocument<import("./models").CampaignDoc>,
    log: mongoose.HydratedDocument<import("./models").MessageLogDoc>,
  ) {
    const finish = (patch: Record<string, unknown>) => MessageLog.updateOne({ _id: log._id }, { $set: patch });
    try {
      // Consent is re-checked at send time: people may opt out while a campaign is running.
      const contact = await Contact.findById(log.contactId).lean();
      if (!contact) return finish({ status: "skipped", error: "Contact was deleted" });
      if (contact.consentStatus !== "opted_in" || (await OptOut.exists({ phone: contact.phone }))) {
        return finish({ status: "skipped", error: "Contact has not consented or has opted out" });
      }

      let imagePath: string | undefined;
      if (campaign.mediaId) {
        const media = await Media.findById(campaign.mediaId).lean();
        imagePath = media ? path.join(env.uploadDir, media.fileName) : undefined;
        if (!imagePath || !fs.existsSync(imagePath)) return finish({ status: "failed", error: "Campaign image is missing" });
      }

      const { text } = renderTemplate(campaign.body, contact);
      const finalText = withFooter(text, env.optOutFooter, campaign.appendOptOutFooter);

      const chatId = await whatsapp.resolveChatId(contact.phone);
      if (!chatId) return finish({ status: "failed", renderedBody: finalText, error: "Number is not registered on WhatsApp" });

      const waMessageId = await whatsapp.send(chatId, finalText, imagePath);
      await finish({ status: "sent", renderedBody: finalText, waMessageId, sentAt: new Date(), error: "" });
      await Contact.updateOne({ _id: contact._id }, { $set: { lastMessagedAt: new Date() } });
    } catch (err) {
      const message = (err as Error)?.message || String(err);
      await finish({ status: "failed", error: message.slice(0, 500) });
      if (!whatsapp.isReady) {
        // Lost the connection mid-send; leave the campaign running so it resumes on reconnect.
        await Campaign.updateOne({ _id: campaign._id }, { $set: { lastError: message.slice(0, 500) } });
      }
    }
  }
}

/** Builds the per-recipient queue for a campaign. Only opted-in, non-suppressed contacts are queued. */
export async function enqueueCampaign(campaignId: mongoose.Types.ObjectId, tags: string[]) {
  const suppressed = new Set((await OptOut.find({}, { phone: 1 }).lean()).map((o) => o.phone));
  const cursor = Contact.find(audienceFilter(tags), { _id: 1, phone: 1, name: 1 }).lean().cursor();
  let batch: Array<Record<string, unknown>> = [];
  let total = 0;
  const flush = async () => {
    if (!batch.length) return;
    await MessageLog.insertMany(batch, { ordered: false }).catch((err) => {
      if (err?.code !== 11000 && !err?.writeErrors) throw err; // ignore duplicates on re-enqueue
    });
    batch = [];
  };
  for await (const c of cursor) {
    if (suppressed.has(c.phone)) continue;
    batch.push({ campaignId, contactId: c._id, phone: c.phone, name: c.name, status: "pending" });
    total++;
    if (batch.length >= 500) await flush();
  }
  await flush();
  return total;
}

/** Called once at boot: anything mid-send when the process died is marked failed (never silently resent). */
export async function recoverInterruptedSends() {
  const res = await MessageLog.updateMany(
    { status: "sending" },
    { $set: { status: "failed", error: "Interrupted by server restart; may or may not have been delivered" } },
  );
  if (res.modifiedCount) console.warn(`[queue] marked ${res.modifiedCount} interrupted message(s) as failed`);
}

export async function campaignStats(ids: mongoose.Types.ObjectId[]) {
  const rows = await MessageLog.aggregate<{ _id: { c: mongoose.Types.ObjectId; s: string }; n: number }>([
    { $match: { campaignId: { $in: ids } } },
    { $group: { _id: { c: "$campaignId", s: "$status" }, n: { $sum: 1 } } },
  ]);
  const out = new Map<string, Record<string, number>>();
  for (const id of ids) out.set(String(id), { pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0 });
  for (const r of rows) out.get(String(r._id.c))![r._id.s] = r.n;
  return out;
}

const g = globalThis as unknown as { __campaignWorker?: CampaignWorker };
export const worker: CampaignWorker = g.__campaignWorker ?? (g.__campaignWorker = new CampaignWorker());

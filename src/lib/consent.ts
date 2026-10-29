import { Contact, MessageLog, OptOut } from "./models";
import { env } from "./env";
import type { QueryFilter } from "mongoose";
import type { ContactDoc } from "./models";

type Method = "keyword" | "manual" | "import";

export async function optOutPhone(phone: string, method: Method, reason = "") {
  await OptOut.updateOne({ phone }, { $setOnInsert: { phone, method, reason } }, { upsert: true });
  await Contact.updateOne(
    { phone },
    { $set: { consentStatus: "opted_out", optedOutAt: new Date(), optOutMethod: method } },
  );
  // Anything still queued for this person must not go out.
  await MessageLog.updateMany(
    { phone, status: "pending" },
    { $set: { status: "skipped", error: "Recipient opted out" } },
  );
}

export async function optInPhone(phone: string, source: string) {
  await OptOut.deleteOne({ phone });
  await Contact.updateOne(
    { phone },
    {
      $set: { consentStatus: "opted_in", consentSource: source.slice(0, 300), consentAt: new Date(), optOutMethod: "" },
      $unset: { optedOutAt: 1 },
    },
  );
}

/** Handles keyword replies (STOP / START). Returns the auto-reply to send, if any. */
export async function handleInboundMessage(phone: string, body: string): Promise<string | null> {
  const word = body.trim().toUpperCase().replace(/[.!]+$/, "");
  if (!word || word.length > 20) return null;
  if (env.optOutKeywords.includes(word)) {
    await optOutPhone(phone, "keyword", `Replied "${word}"`);
    console.log(`[consent] ${phone} opted out via keyword`);
    return env.optOutReply;
  }
  if (env.optInKeywords.includes(word)) {
    const exists = await Contact.exists({ phone });
    if (!exists) return null;
    await optInPhone(phone, `Replied "${word}" on WhatsApp`);
    console.log(`[consent] ${phone} opted in via keyword`);
    return env.optInReply;
  }
  return null;
}

/** Only contacts with explicit opt-in consent are ever eligible for campaigns. */
export function audienceFilter(tags: string[]): QueryFilter<ContactDoc> {
  const filter: QueryFilter<ContactDoc> = { consentStatus: "opted_in" };
  if (tags.length) filter.tags = { $in: tags };
  return filter;
}

export async function isSuppressed(phone: string): Promise<boolean> {
  return !!(await OptOut.exists({ phone }));
}

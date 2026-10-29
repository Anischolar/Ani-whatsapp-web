import { z } from "zod";
import { json, readJson, route } from "@/lib/api";
import { Contact } from "@/lib/models";
import { audienceFilter } from "@/lib/consent";
import { extractPlaceholders, renderTemplate, withFooter } from "@/lib/template";
import { env } from "@/lib/env";

const schema = z.object({
  body: z.string().max(4096).default(""),
  audienceTags: z.array(z.string().trim().toLowerCase()).max(50).default([]),
  appendOptOutFooter: z.boolean().default(true),
  contactId: z.string().optional(),
});

export const POST = route(async (req) => {
  const { body, audienceTags, appendOptOutFooter, contactId } = schema.parse(await readJson(req));
  // Opting out always flips consentStatus, so the consent filter already excludes the suppression list.
  const filter = audienceFilter(audienceTags);
  const [audienceCount, excludedNoConsent] = await Promise.all([
    Contact.countDocuments(filter),
    Contact.countDocuments({ ...(audienceTags.length ? { tags: { $in: audienceTags } } : {}), consentStatus: { $ne: "opted_in" } }),
  ]);

  const samples = contactId
    ? await Contact.find({ _id: contactId }).lean()
    : await Contact.find(filter).sort({ _id: 1 }).limit(3).lean();
  const list = samples.length ? samples : [{ name: "Jane Doe", phone: "14155550123", attributes: {} }];

  const placeholders = extractPlaceholders(body);
  const previews = list.map((c) => {
    const { text, missing } = renderTemplate(body, c);
    return {
      name: c.name || "",
      phone: c.phone,
      text: withFooter(text, env.optOutFooter, appendOptOutFooter),
      missing,
      sample: !samples.length,
    };
  });

  return json({
    audienceCount,
    excludedNoConsent,
    placeholders,
    previews,
    footer: env.optOutFooter,
  });
});

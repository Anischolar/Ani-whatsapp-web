import { z } from "zod";
import { HttpError, escapeRegex, json, objectId, readJson, route } from "@/lib/api";
import { Contact, MessageLog, OptOut, CONSENT_STATUSES, type ConsentStatus } from "@/lib/models";
import { normalizePhone } from "@/lib/phone";
import { normalizeKey } from "@/lib/template";
import { env } from "@/lib/env";
import type { QueryFilter } from "mongoose";
import type { ContactDoc } from "@/lib/models";

export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 25));
  const filter: QueryFilter<ContactDoc> = {};
  const q = sp.get("q")?.trim();
  if (q) {
    const or: QueryFilter<ContactDoc>[] = [{ name: new RegExp(escapeRegex(q), "i") }];
    const digits = q.replace(/\D/g, "");
    if (digits) or.push({ phone: new RegExp(escapeRegex(digits)) });
    filter.$or = or;
  }
  const consent = sp.get("consent");
  if (consent && (CONSENT_STATUSES as readonly string[]).includes(consent)) filter.consentStatus = consent as ConsentStatus;
  const tag = sp.get("tag");
  if (tag) filter.tags = tag;

  const [items, total] = await Promise.all([
    Contact.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Contact.countDocuments(filter),
  ]);
  return json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

const createSchema = z
  .object({
    phone: z.string().min(3).max(30),
    name: z.string().trim().max(120).default(""),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
    attributes: z.record(z.string(), z.string().max(500)).default({}),
    consentStatus: z.enum(["opted_in", "pending"]).default("pending"),
    consentSource: z.string().trim().max(300).default(""),
  })
  .refine((d) => d.consentStatus !== "opted_in" || d.consentSource.length >= 3, {
    message: "Describe how consent was obtained (e.g. 'Signed up at store counter, 2026-10-01')",
    path: ["consentSource"],
  });

export const POST = route(async (req) => {
  const data = createSchema.parse(await readJson(req));
  const phone = normalizePhone(data.phone, env.defaultCountry);
  if (!phone) throw new HttpError(400, "Invalid phone number. Include the country code, e.g. +14155550123");
  if (await Contact.exists({ phone })) throw new HttpError(409, "A contact with this phone number already exists");

  const suppressed = !!(await OptOut.exists({ phone }));
  const optedIn = data.consentStatus === "opted_in" && !suppressed;
  const contact = await Contact.create({
    phone,
    name: data.name,
    tags: [...new Set(data.tags)],
    attributes: Object.fromEntries(Object.entries(data.attributes).map(([k, v]) => [normalizeKey(k), v])),
    consentStatus: suppressed ? "opted_out" : data.consentStatus,
    consentSource: optedIn ? data.consentSource : "",
    consentAt: optedIn ? new Date() : undefined,
    optedOutAt: suppressed ? new Date() : undefined,
  });
  return json(
    { contact, warning: suppressed ? "This number previously opted out, so it was saved as opted out." : null },
    201,
  );
});

const bulkSchema = z.object({ ids: z.array(z.string()).min(1).max(1000) });

export const DELETE = route(async (req) => {
  const { ids } = bulkSchema.parse(await readJson(req));
  const oids = ids.map(objectId);
  // Opt-outs stay in the suppression list even when the contact is deleted.
  const res = await Contact.deleteMany({ _id: { $in: oids } });
  await MessageLog.updateMany(
    { contactId: { $in: oids }, status: "pending" },
    { $set: { status: "skipped", error: "Contact was deleted" } },
  );
  return json({ deleted: res.deletedCount });
});

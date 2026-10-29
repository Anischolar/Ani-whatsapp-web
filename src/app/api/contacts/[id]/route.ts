import { z } from "zod";
import { HttpError, json, objectId, readJson, route } from "@/lib/api";
import { Contact, MessageLog } from "@/lib/models";
import { optInPhone, optOutPhone } from "@/lib/consent";
import { normalizeKey } from "@/lib/template";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().max(120).optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).optional(),
  attributes: z.record(z.string(), z.string().max(500)).optional(),
  action: z.enum(["opt_in", "opt_out"]).optional(),
  consentSource: z.string().trim().max(300).optional(),
  reason: z.string().trim().max(300).optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const id = objectId((await params).id);
  const data = patchSchema.parse(await readJson(req));
  const contact = await Contact.findById(id);
  if (!contact) throw new HttpError(404, "Contact not found");
  if (data.action === "opt_in" && (!data.consentSource || data.consentSource.length < 3)) {
    throw new HttpError(400, "Record how this person gave consent before opting them in");
  }

  if (data.name !== undefined) contact.name = data.name;
  if (data.tags) contact.tags = [...new Set(data.tags)];
  if (data.attributes) {
    contact.set(
      "attributes",
      Object.fromEntries(Object.entries(data.attributes).map(([k, v]) => [normalizeKey(k), v])),
    );
  }
  await contact.save();

  if (data.action === "opt_out") await optOutPhone(contact.phone, "manual", data.reason || "Opted out by admin");
  if (data.action === "opt_in") await optInPhone(contact.phone, data.consentSource!);
  return json({ contact: await Contact.findById(id).lean() });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const id = objectId((await params).id);
  const res = await Contact.deleteOne({ _id: id });
  if (!res.deletedCount) throw new HttpError(404, "Contact not found");
  await MessageLog.updateMany(
    { contactId: id, status: "pending" },
    { $set: { status: "skipped", error: "Contact was deleted" } },
  );
  return json({ ok: true });
});

import { z } from "zod";
import { HttpError, json, route } from "@/lib/api";
import { Contact, OptOut } from "@/lib/models";
import { parseContactsCsv } from "@/lib/csv";
import { optOutPhone } from "@/lib/consent";
import { env } from "@/lib/env";
import type { AnyBulkWriteOperation } from "mongoose";
import type { ContactDoc } from "@/lib/models";

const optsSchema = z
  .object({
    // file: use the CSV's consent column; all: every row consented (attested); none: import everyone as pending
    consentMode: z.enum(["file", "all", "none"]),
    consentSource: z.string().trim().max(300).default(""),
    attest: z.enum(["true", "false"]).default("false"),
    tags: z.string().max(400).default(""),
  })
  .refine((o) => o.consentMode === "none" || (o.attest === "true" && o.consentSource.length >= 3), {
    message: "To import opted-in contacts, confirm consent and describe how it was collected",
    path: ["consentSource"],
  });

export const POST = route(async (req) => {
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected multipart/form-data");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No CSV file uploaded");
  if (file.size === 0) throw new HttpError(400, "The file is empty");
  if (file.size > env.maxCsvBytes) throw new HttpError(413, `CSV must be under ${env.maxCsvBytes / 1024 / 1024} MB`);
  if (!/\.(csv|txt)$/i.test(file.name)) throw new HttpError(400, "Only .csv files are accepted");

  const opts = optsSchema.parse({
    consentMode: form.get("consentMode"),
    consentSource: form.get("consentSource") ?? undefined,
    attest: form.get("attest") ?? undefined,
    tags: form.get("tags") ?? undefined,
  });
  const extraTags = opts.tags
    .split(/[;,]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);

  const text = await file.text();
  if (text.includes("\u0000")) throw new HttpError(400, "File does not look like a text CSV");
  const parsed = parseContactsCsv(text, { defaultCountry: env.defaultCountry, maxRows: env.maxCsvRows });
  const summary = { created: 0, updated: 0, suppressed: 0, optedOut: 0, invalid: parsed.errors.length, duplicates: parsed.duplicates };
  if (!parsed.rows.length) return json({ ...summary, errors: parsed.errors.slice(0, 100) }, 400);

  const phones = parsed.rows.map((r) => r.phone);
  const [existing, suppressedRows] = await Promise.all([
    Contact.find({ phone: { $in: phones } }, { phone: 1, consentStatus: 1 }).lean(),
    OptOut.find({ phone: { $in: phones } }, { phone: 1 }).lean(),
  ]);
  const existingMap = new Map(existing.map((c) => [c.phone, c]));
  const suppressed = new Set(suppressedRows.map((s) => s.phone));
  const now = new Date();
  const ops: AnyBulkWriteOperation<ContactDoc>[] = [];
  const newOptOuts: string[] = [];

  for (const row of parsed.rows) {
    if (row.consent === "opted_out") newOptOuts.push(row.phone);
    if (suppressed.has(row.phone)) summary.suppressed++;
    const isSuppressed = suppressed.has(row.phone) || row.consent === "opted_out";
    const wanted =
      opts.consentMode === "all" ? "opted_in" : opts.consentMode === "file" ? (row.consent ?? "pending") : "pending";
    const tags = [...new Set([...row.tags, ...extraTags])];
    const prev = existingMap.get(row.phone);

    if (prev) {
      summary.updated++;
      const set: Record<string, unknown> = {};
      if (row.name) set.name = row.name;
      for (const [k, v] of Object.entries(row.attributes)) set[`attributes.${k}`] = v;
      // Never re-subscribe a suppressed number, and never downgrade an existing opt-in to pending.
      if (!isSuppressed && wanted === "opted_in" && prev.consentStatus === "pending") {
        Object.assign(set, { consentStatus: "opted_in", consentSource: opts.consentSource, consentAt: now });
      }
      ops.push({ updateOne: { filter: { phone: row.phone }, update: { $set: set, $addToSet: { tags: { $each: tags } } } } });
    } else {
      summary.created++;
      const consentStatus = isSuppressed ? "opted_out" : wanted;
      ops.push({
        insertOne: {
          document: {
            phone: row.phone,
            name: row.name,
            tags,
            attributes: row.attributes,
            consentStatus,
            consentSource: consentStatus === "opted_in" ? opts.consentSource : "",
            consentAt: consentStatus === "opted_in" ? now : undefined,
            optedOutAt: consentStatus === "opted_out" ? now : undefined,
          } as unknown as ContactDoc,
        },
      });
    }
  }

  for (let i = 0; i < ops.length; i += 1000) await Contact.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
  for (const phone of newOptOuts) await optOutPhone(phone, "import", "Marked opted out in imported CSV");
  summary.optedOut = newOptOuts.length;

  return json({ ...summary, errors: parsed.errors.slice(0, 100) });
});

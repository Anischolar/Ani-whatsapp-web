import { z } from "zod";
import { HttpError, escapeRegex, json, readJson, route } from "@/lib/api";
import { OptOut } from "@/lib/models";
import { optOutPhone } from "@/lib/consent";
import { normalizePhone } from "@/lib/phone";
import { env } from "@/lib/env";

export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = 50;
  const q = sp.get("q")?.replace(/\D/g, "");
  const filter = q ? { phone: new RegExp(escapeRegex(q)) } : {};
  const [items, total] = await Promise.all([
    OptOut.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    OptOut.countDocuments(filter),
  ]);
  return json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

const schema = z.object({ phone: z.string().min(3).max(30), reason: z.string().trim().max(300).default("") });

/** Manually add a number to the suppression list (e.g. someone asked by email or phone call). */
export const POST = route(async (req) => {
  const { phone: raw, reason } = schema.parse(await readJson(req));
  const phone = normalizePhone(raw, env.defaultCountry);
  if (!phone) throw new HttpError(400, "Invalid phone number");
  await optOutPhone(phone, "manual", reason || "Added to suppression list by admin");
  return json({ ok: true, phone }, 201);
});

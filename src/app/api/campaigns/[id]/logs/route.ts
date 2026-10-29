import Papa from "papaparse";
import { escapeRegex, json, objectId, route } from "@/lib/api";
import { LOG_STATUSES, MessageLog, type LogStatus } from "@/lib/models";
import type { QueryFilter } from "mongoose";
import type { MessageLogDoc } from "@/lib/models";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const campaignId = objectId((await params).id);
  const sp = new URL(req.url).searchParams;
  const filter: QueryFilter<MessageLogDoc> = { campaignId };
  const status = sp.get("status");
  if (status && (LOG_STATUSES as readonly string[]).includes(status)) filter.status = status as LogStatus;
  const q = sp.get("q")?.trim();
  if (q) filter.$or = [{ name: new RegExp(escapeRegex(q), "i") }, { phone: new RegExp(escapeRegex(q.replace(/\D/g, "") || q)) }];

  if (sp.get("format") === "csv") {
    const rows = await MessageLog.find(filter).sort({ _id: 1 }).lean();
    const csv = Papa.unparse(
      rows.map((r) => ({
        phone: `+${r.phone}`,
        name: r.name,
        status: r.status,
        error: r.error,
        attempts: r.attempts,
        sent_at: r.sentAt ? new Date(r.sentAt).toISOString() : "",
      })),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="campaign-${campaignId}-logs.csv"`,
      },
    });
  }

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
  const [items, total] = await Promise.all([
    MessageLog.find(filter).sort({ updatedAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    MessageLog.countDocuments(filter),
  ]);
  return json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

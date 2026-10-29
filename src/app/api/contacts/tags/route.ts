import { json, route } from "@/lib/api";
import { Contact } from "@/lib/models";

export const GET = route(async () => {
  const rows = await Contact.aggregate<{ _id: string; total: number; optedIn: number }>([
    { $unwind: "$tags" },
    {
      $group: {
        _id: "$tags",
        total: { $sum: 1 },
        optedIn: { $sum: { $cond: [{ $eq: ["$consentStatus", "opted_in"] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return json({ tags: rows.map((r) => ({ tag: r._id, total: r.total, optedIn: r.optedIn })) });
});

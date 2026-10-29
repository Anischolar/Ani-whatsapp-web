"use client";

import Link from "next/link";
import { formatDate, useApi } from "@/lib/client";
import { Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { CampaignStatusBadge, ProgressBar } from "@/components/status";

type Campaign = {
  _id: string;
  name: string;
  status: string;
  total: number;
  createdAt: string;
  startedAt?: string;
  stats: Record<string, number>;
};

export default function CampaignsPage() {
  const { data, loading } = useApi<{ items: Campaign[] }>("/api/campaigns", 4000);
  const items = data?.items ?? [];

  return (
    <>
      <PageHeader title="Campaigns" description="Bulk sends with a persistent queue. Progress updates live." actions={<Link href="/campaigns/new"><Button>New campaign</Button></Link>} />
      <Card>
        {loading && !data ? (
          <div className="flex justify-center py-16 text-slate-400"><Spinner /></div>
        ) : items.length === 0 ? (
          <EmptyState title="No campaigns yet" description="Create your first campaign to message your opted-in contacts." action={<Link href="/campaigns/new"><Button>New campaign</Button></Link>} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((c) => {
              const done = (c.stats.sent || 0) + (c.stats.failed || 0) + (c.stats.skipped || 0);
              return (
                <li key={c._id}>
                  <Link href={`/campaigns/${c._id}`} className="block px-5 py-4 hover:bg-slate-50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-500">Created {formatDate(c.createdAt)}</p>
                      </div>
                      <CampaignStatusBadge status={c.status} />
                    </div>
                    {c.status !== "draft" && (
                      <div className="mt-3">
                        <ProgressBar stats={c.stats} total={c.total} />
                        <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
                          <span>{done}/{c.total} processed</span>
                          <span className="text-emerald-700">{c.stats.sent || 0} sent</span>
                          <span className="text-rose-600">{c.stats.failed || 0} failed</span>
                          <span className="text-amber-700">{c.stats.skipped || 0} skipped</span>
                        </div>
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

"use client";

import Link from "next/link";
import { useApi, formatDate } from "@/lib/client";
import { Alert, Button, Card, CardHeader, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { CampaignStatusBadge, WaStatusBadge } from "@/components/status";

type Stats = {
  contacts: Record<string, number>;
  campaigns: Record<string, number>;
  templates: number;
  sent24h: number;
  failed24h: number;
  dailyLimit: number;
  recentCampaigns: Array<{ _id: string; name: string; status: string; total: number; createdAt: string }>;
  whatsapp: string;
  worker: { state: string; detail: string };
};

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

export default function DashboardPage() {
  const { data, loading, error } = useApi<Stats>("/api/stats", 5000);

  if (loading && !data) return <div className="flex justify-center py-20 text-slate-400"><Spinner /></div>;
  if (error && !data) return <Alert color="red" title="Could not load dashboard">{error}</Alert>;
  if (!data) return null;

  const c = data.contacts;
  const totalContacts = (c.opted_in || 0) + (c.pending || 0) + (c.opted_out || 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your contacts, campaigns and WhatsApp connection."
        actions={<Link href="/campaigns/new"><Button>New campaign</Button></Link>}
      />

      {data.whatsapp !== "ready" && (
        <div className="mb-6">
          <Alert color="yellow" title="WhatsApp is not connected">
            Campaigns will wait in the queue until you <Link href="/whatsapp" className="font-medium underline">connect WhatsApp</Link>.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Opted-in contacts" value={(c.opted_in || 0).toLocaleString()} sub={`${totalContacts.toLocaleString()} total`} />
        <Stat label="Opted out" value={(c.opted_out || 0).toLocaleString()} sub={`${(c.pending || 0).toLocaleString()} without consent`} />
        <Stat label="Sent (24h)" value={data.sent24h.toLocaleString()} sub={data.dailyLimit ? `Daily limit ${data.dailyLimit.toLocaleString()}` : "No daily limit"} />
        <Stat label="Failed (24h)" value={data.failed24h.toLocaleString()} sub={`${data.campaigns.running || 0} running campaign(s)`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent campaigns" actions={<Link href="/campaigns" className="text-sm font-medium text-emerald-700 hover:underline">View all</Link>} />
          {data.recentCampaigns.length === 0 ? (
            <EmptyState title="No campaigns yet" description="Create a template, import opted-in contacts, then launch your first campaign." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentCampaigns.map((cm) => (
                <li key={cm._id}>
                  <Link href={`/campaigns/${cm._id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{cm.name}</p>
                      <p className="text-xs text-slate-500">{formatDate(cm.createdAt)} · {cm.total} recipients</p>
                    </div>
                    <CampaignStatusBadge status={cm.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="System status" />
          <dl className="space-y-3 px-5 py-4 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">WhatsApp</dt>
              <dd><WaStatusBadge status={data.whatsapp} /></dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Queue</dt>
              <dd className="text-right font-medium capitalize text-slate-800">{data.worker.state.replace("_", " ")}</dd>
            </div>
            {data.worker.detail && <p className="text-xs text-slate-500">{data.worker.detail}</p>}
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Templates</dt>
              <dd className="font-medium text-slate-800">{data.templates}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}

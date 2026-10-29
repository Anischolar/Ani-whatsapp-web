"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { api, formatDate, useApi } from "@/lib/client";
import { Alert, Button, Card, CardHeader, EmptyState, Input, PageHeader, Pagination, Select, Spinner, cn } from "@/components/ui";
import { CampaignStatusBadge, LogStatusBadge, ProgressBar } from "@/components/status";
import { MessagePreview } from "@/components/message-preview";
import { mediaUrl } from "@/components/media-picker";
import { useToast } from "@/components/toast";

type Campaign = {
  _id: string;
  name: string;
  body: string;
  mediaId: string | null;
  status: string;
  total: number;
  audienceTags: string[];
  minDelaySec: number;
  maxDelaySec: number;
  appendOptOutFooter: boolean;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  lastError: string;
  stats: Record<string, number>;
};
type Log = { _id: string; phone: string; name: string; status: string; error: string; attempts: number; renderedBody: string; sentAt?: string; updatedAt: string };

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { data, error, reload } = useApi<{ item: Campaign; worker: { state: string; detail: string } }>(`/api/campaigns/${id}`, 3000);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const logParams = new URLSearchParams({ page: String(page), limit: "50" });
  if (status) logParams.set("status", status);
  if (q) logParams.set("q", q);
  const { data: logs, reload: reloadLogs } = useApi<{ items: Log[]; total: number; page: number; pages: number }>(`/api/campaigns/${id}/logs?${logParams}`, 4000);

  async function act(action: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(action);
    try {
      await api(`/api/campaigns/${id}/action`, { method: "POST", json: { action } });
      toast(`Campaign ${action === "retry_failed" ? "retrying failed messages" : action + (action.endsWith("e") ? "d" : "ed")}`);
      await Promise.all([reload(), reloadLogs()]);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this campaign and all its logs?")) return;
    try {
      await api(`/api/campaigns/${id}`, { method: "DELETE" });
      toast("Campaign deleted");
      router.push("/campaigns");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  if (error && !data) return <Alert color="red" title="Could not load campaign">{error}</Alert>;
  if (!data) return <div className="flex justify-center py-20 text-slate-400"><Spinner /></div>;

  const c = data.item;
  const s = c.stats;
  const processed = (s.sent || 0) + (s.failed || 0) + (s.skipped || 0);
  const pct = c.total ? Math.round((processed / c.total) * 100) : 0;

  return (
    <>
      <div className="mb-2 text-sm"><Link href="/campaigns" className="text-slate-500 hover:text-slate-700">← Campaigns</Link></div>
      <PageHeader
        title={c.name}
        description={<span className="flex flex-wrap items-center gap-2"><CampaignStatusBadge status={c.status} /> Created {formatDate(c.createdAt)}</span>}
        actions={
          <>
            {c.status === "draft" && <Button onClick={() => act("start", "Start sending this campaign to all eligible opted-in contacts?")} loading={busy === "start"}>Start</Button>}
            {c.status === "running" && <Button variant="secondary" onClick={() => act("pause")} loading={busy === "pause"}>Pause</Button>}
            {c.status === "paused" && <Button onClick={() => act("resume")} loading={busy === "resume"}>Resume</Button>}
            {(c.status === "running" || c.status === "paused") && (
              <Button variant="danger" onClick={() => act("cancel", "Cancel this campaign? Remaining messages will not be sent.")} loading={busy === "cancel"}>Cancel</Button>
            )}
            {(s.failed || 0) > 0 && c.status !== "draft" && (
              <Button variant="secondary" onClick={() => act("retry_failed", `Retry ${s.failed} failed message(s)?`)} loading={busy === "retry_failed"}>Retry failed</Button>
            )}
            {c.status !== "running" && <Button variant="ghost" className="text-rose-600" onClick={remove}>Delete</Button>}
          </>
        }
      />

      {c.status === "running" && data.worker.state === "waiting_whatsapp" && (
        <div className="mb-6"><Alert color="yellow">Waiting for WhatsApp to connect. <Link href="/whatsapp" className="font-medium underline">Connect now</Link>.</Alert></div>
      )}
      {c.status === "running" && data.worker.state === "daily_limit" && (
        <div className="mb-6"><Alert color="yellow">{data.worker.detail}. Sending resumes automatically.</Alert></div>
      )}
      {c.lastError && c.status !== "completed" && <div className="mb-6"><Alert color="red">Last error: {c.lastError}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Progress" description={c.status === "running" && data.worker.detail ? data.worker.detail : undefined} />
          <div className="p-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-3xl font-semibold tabular-nums text-slate-900">{pct}%</span>
              <span className="text-sm text-slate-500">{processed.toLocaleString()} / {c.total.toLocaleString()}</span>
            </div>
            <ProgressBar stats={s} total={c.total} />
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Sent", s.sent, "text-emerald-700"],
                ["Failed", s.failed, "text-rose-600"],
                ["Skipped", s.skipped, "text-amber-700"],
                ["Pending", (s.pending || 0) + (s.sending || 0), "text-slate-700"],
              ].map(([label, n, color]) => (
                <div key={label as string} className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className={cn("text-xl font-semibold tabular-nums", color as string)}>{(n as number) || 0}</dd>
                </div>
              ))}
            </dl>
            <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="inline text-slate-500">Audience: </dt><dd className="inline text-slate-800">{c.audienceTags.length ? c.audienceTags.join(", ") : "All opted-in contacts"}</dd></div>
              <div><dt className="inline text-slate-500">Delay: </dt><dd className="inline text-slate-800">{c.minDelaySec}–{c.maxDelaySec}s</dd></div>
              <div><dt className="inline text-slate-500">Started: </dt><dd className="inline text-slate-800">{formatDate(c.startedAt)}</dd></div>
              <div><dt className="inline text-slate-500">Finished: </dt><dd className="inline text-slate-800">{formatDate(c.completedAt)}</dd></div>
            </dl>
          </div>
        </Card>
        <Card>
          <CardHeader title="Message" description={c.appendOptOutFooter ? "Opt-out footer is appended" : "No opt-out footer"} />
          <div className="p-4">
            <MessagePreview text={c.body} imageUrl={c.mediaId ? mediaUrl(c.mediaId) : null} />
            <p className="mt-2 text-xs text-slate-500">Placeholders are filled per recipient at send time.</p>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Delivery log"
          actions={c.status !== "draft" && <a href={`/api/campaigns/${id}/logs?format=csv${status ? `&status=${status}` : ""}`}><Button variant="secondary" size="sm">Export CSV</Button></a>}
        />
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <Input placeholder="Search name or phone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="sm:max-w-xs" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-44">
            <option value="">All statuses</option>
            {["pending", "sending", "sent", "failed", "skipped"].map((st) => <option key={st} value={st}>{st}</option>)}
          </Select>
        </div>
        {!logs ? (
          <div className="flex justify-center py-10 text-slate-400"><Spinner /></div>
        ) : logs.items.length === 0 ? (
          <EmptyState title={c.status === "draft" ? "Not started yet" : "No log entries"} description={c.status === "draft" ? "The recipient list is built when the campaign starts." : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.items.map((l) => (
                  <tr key={l._id} className="cursor-pointer align-top hover:bg-slate-50/60" onClick={() => setExpanded(expanded === l._id ? null : l._id)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{l.name || "—"}</p>
                      <p className="font-mono text-xs text-slate-500">+{l.phone}</p>
                    </td>
                    <td className="px-4 py-3"><LogStatusBadge status={l.status} /></td>
                    <td className="max-w-md px-4 py-3 text-xs text-slate-600">
                      {l.error ? <span className="text-rose-700">{l.error}</span> : l.status === "sent" ? `Delivered to WhatsApp ${formatDate(l.sentAt)}` : ""}
                      {l.attempts > 1 && <span className="ml-1 text-slate-400">({l.attempts} attempts)</span>}
                      {expanded === l._id && l.renderedBody && <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-2 font-sans text-slate-700">{l.renderedBody}</pre>}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-slate-500 sm:table-cell">{formatDate(l.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {logs && logs.total > 0 && <Pagination page={logs.page} pages={logs.pages} total={logs.total} onPage={setPage} />}
      </Card>
    </>
  );
}

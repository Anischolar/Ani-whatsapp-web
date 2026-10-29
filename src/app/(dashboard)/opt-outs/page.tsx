"use client";

import { useState } from "react";
import { api, formatDate, useApi } from "@/lib/client";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pagination, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";

type OptOut = { _id: string; phone: string; method: string; reason: string; createdAt: string };

export default function OptOutsPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams({ page: String(page) });
  if (q) params.set("q", q);
  const { data, loading, reload } = useApi<{ items: OptOut[]; total: number; page: number; pages: number }>(`/api/optouts?${params}`, 10000);

  async function add() {
    setSaving(true);
    setError(null);
    try {
      await api("/api/optouts", { method: "POST", json: { phone, reason } });
      toast("Number added to the opt-out list");
      setPhone("");
      setReason("");
      setOpen(false);
      void reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Opt-outs"
        description="Numbers on this list never receive campaign messages, even if re-imported or deleted as contacts."
        actions={<Button onClick={() => setOpen(true)}>Add number</Button>}
      />
      <div className="mb-6">
        <Alert color="blue" title="Automatic opt-out">
          When someone replies <strong>STOP</strong> (or UNSUBSCRIBE, CANCEL, END, QUIT) to your WhatsApp number, they are added here instantly and receive a
          confirmation. Replying <strong>START</strong> re-subscribes them.
        </Alert>
      </div>
      <Card>
        <div className="border-b border-slate-100 p-4">
          <Input placeholder="Search phone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="sm:max-w-xs" />
        </div>
        {loading && !data ? (
          <div className="flex justify-center py-16 text-slate-400"><Spinner /></div>
        ) : !data?.items.length ? (
          <EmptyState title="No opt-outs" description="Nobody has unsubscribed yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Reason</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((o) => (
                  <tr key={o._id}>
                    <td className="px-4 py-3 font-mono text-xs">+{o.phone}</td>
                    <td className="px-4 py-3"><Badge color={o.method === "keyword" ? "blue" : "gray"}>{o.method === "keyword" ? "Replied STOP" : o.method}</Badge></td>
                    <td className="hidden px-4 py-3 text-xs text-slate-600 sm:table-cell">{o.reason}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add number to opt-out list"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={add} loading={saving} disabled={!phone}>Add</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Phone number" hint="Include the country code">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 415 555 0123" inputMode="tel" />
          </Field>
          <Field label="Reason (optional)">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Asked by email to stop" />
          </Field>
          {error && <Alert color="red">{error}</Alert>}
        </div>
      </Modal>
    </>
  );
}

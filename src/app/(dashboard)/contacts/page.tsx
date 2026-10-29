"use client";

import { useEffect, useState } from "react";
import { api, formatDate, useApi } from "@/lib/client";
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Textarea } from "@/components/ui";
import { ConsentBadge } from "@/components/status";
import { useToast } from "@/components/toast";

type Contact = {
  _id: string;
  phone: string;
  name: string;
  tags: string[];
  attributes: Record<string, string>;
  consentStatus: "opted_in" | "pending" | "opted_out";
  consentSource: string;
  consentAt?: string;
  optedOutAt?: string;
  optOutMethod?: string;
  lastMessagedAt?: string;
  createdAt: string;
};
type ListRes = { items: Contact[]; total: number; page: number; pages: number };
type ImportRes = { created: number; updated: number; suppressed: number; optedOut: number; invalid: number; duplicates: number; errors: { row: number; message: string }[] };

const parseTags = (s: string) => [...new Set(s.split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];

export default function ContactsPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [consent, setConsent] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<null | "add" | "import">(null);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [optingIn, setOptingIn] = useState<Contact | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams({ page: String(page), limit: "25" });
  if (debouncedQ) params.set("q", debouncedQ);
  if (consent) params.set("consent", consent);
  if (tag) params.set("tag", tag);
  const { data, loading, reload } = useApi<ListRes>(`/api/contacts?${params}`);
  const { data: tagData, reload: reloadTags } = useApi<{ tags: { tag: string; total: number; optedIn: number }[] }>("/api/contacts/tags");

  const refresh = () => {
    void reload();
    void reloadTags();
    setSelected(new Set());
  };

  async function optOut(c: Contact) {
    if (!confirm(`Opt out ${c.name || "+" + c.phone}? They will be excluded from all future campaigns.`)) return;
    try {
      await api(`/api/contacts/${c._id}`, { method: "PATCH", json: { action: "opt_out", reason: "Opted out by admin" } });
      toast("Contact opted out");
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function remove(ids: string[]) {
    if (!confirm(`Delete ${ids.length} contact(s)? Opt-out records are kept in the suppression list.`)) return;
    try {
      await api("/api/contacts", { method: "DELETE", json: { ids } });
      toast(`Deleted ${ids.length} contact(s)`);
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((c) => selected.has(c._id));

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Only contacts marked “Opted in” receive campaign messages."
        actions={
          <>
            <a href="/contacts-template.csv" download>
              <Button variant="ghost">CSV template</Button>
            </a>
            <Button variant="secondary" onClick={() => setModal("import")}>Import CSV</Button>
            <Button onClick={() => setModal("add")}>Add contact</Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <Input placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
          <Select value={consent} onChange={(e) => { setConsent(e.target.value); setPage(1); }} className="sm:w-44">
            <option value="">All consent states</option>
            <option value="opted_in">Opted in</option>
            <option value="pending">No consent</option>
            <option value="opted_out">Opted out</option>
          </Select>
          <Select value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} className="sm:w-44">
            <option value="">All tags</option>
            {tagData?.tags.map((t) => (
              <option key={t.tag} value={t.tag}>{t.tag} ({t.total})</option>
            ))}
          </Select>
          {selected.size > 0 && (
            <Button variant="danger" className="sm:ml-auto" onClick={() => remove([...selected])}>
              Delete {selected.size}
            </Button>
          )}
        </div>

        {loading && !data ? (
          <div className="flex justify-center py-16 text-slate-400"><Spinner /></div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No contacts found"
            description={debouncedQ || consent || tag ? "Try different filters." : "Import a CSV of people who have agreed to receive your messages."}
            action={!debouncedQ && !consent && !tag && <Button onClick={() => setModal("import")}>Import CSV</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" aria-label="Select all" className="accent-emerald-600" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((c) => c._id)) : new Set())} />
                  </th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Consent</th>
                  <th className="hidden px-4 py-3 md:table-cell">Tags</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Added</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${c.name || c.phone}`}
                        className="accent-emerald-600"
                        checked={selected.has(c._id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(c._id);
                          else next.delete(c._id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{c.name || <span className="text-slate-400">No name</span>}</p>
                      <p className="font-mono text-xs text-slate-500">+{c.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <ConsentBadge status={c.consentStatus} />
                      <p className="mt-1 max-w-[14rem] truncate text-xs text-slate-500" title={c.consentStatus === "opted_out" ? `Opted out (${c.optOutMethod})` : c.consentSource}>
                        {c.consentStatus === "opted_out" ? `${c.optOutMethod || "opted out"} · ${formatDate(c.optedOutAt)}` : c.consentSource}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {c.tags.map((t) => <Badge key={t}>{t}</Badge>)}
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-slate-500 lg:table-cell">{formatDate(c.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>Edit</Button>
                      {c.consentStatus === "opted_out" ? (
                        <Button variant="ghost" size="sm" onClick={() => setOptingIn(c)}>Re-opt in</Button>
                      ) : c.consentStatus === "pending" ? (
                        <Button variant="ghost" size="sm" onClick={() => setOptingIn(c)}>Record consent</Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => optOut(c)}>Opt out</Button>
                      )}
                      <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => remove([c._id])}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </Card>

      <AddContactModal open={modal === "add"} onClose={() => setModal(null)} onSaved={refresh} />
      <ImportModal open={modal === "import"} onClose={() => setModal(null)} onDone={refresh} />
      {editing && <EditContactModal key={editing._id} contact={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {optingIn && <OptInModal key={optingIn._id} contact={optingIn} onClose={() => setOptingIn(null)} onSaved={refresh} />}
    </>
  );
}

function AddContactModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ phone: "", name: "", tags: "", consented: false, consentSource: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ warning: string | null }>("/api/contacts", {
        method: "POST",
        json: {
          phone: form.phone,
          name: form.name,
          tags: parseTags(form.tags),
          consentStatus: form.consented ? "opted_in" : "pending",
          consentSource: form.consentSource,
        },
      });
      toast(res.warning || "Contact added", res.warning ? "info" : "success");
      setForm({ phone: "", name: "", tags: "", consented: false, consentSource: "" });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add contact"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!form.phone || (form.consented && form.consentSource.trim().length < 3)}>Save contact</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Phone number" hint="Include the country code, e.g. +44 7911 123456">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 415 555 0123" inputMode="tel" />
        </Field>
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Tags" hint="Comma separated, e.g. vip, newsletter">
          <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </Field>
        <Checkbox
          label="This person has agreed to receive marketing messages on WhatsApp"
          checked={form.consented}
          onChange={(v) => setForm({ ...form, consented: v })}
        />
        {form.consented && (
          <Field label="How was consent obtained?" hint="Kept as your consent record.">
            <Input value={form.consentSource} onChange={(e) => setForm({ ...form, consentSource: e.target.value })} placeholder="e.g. Website signup form, 2026-10-12" />
          </Field>
        )}
        {error && <Alert color="red">{error}</Alert>}
      </div>
    </Modal>
  );
}

// Mounted with key={contact._id}, so state initialises from props for each contact.
function EditContactModal({ contact, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(contact.name);
  const [tags, setTags] = useState(contact.tags.join(", "));
  const [attrs, setAttrs] = useState(() =>
    Object.entries(contact.attributes || {})
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    try {
      const attributes = Object.fromEntries(
        attrs
          .split("\n")
          .map((l) => l.split("="))
          .filter((p) => p.length >= 2 && p[0].trim())
          .map(([k, ...v]) => [k.trim(), v.join("=").trim()]),
      );
      await api(`/api/contacts/${contact._id}`, { method: "PATCH", json: { name, tags: parseTags(tags), attributes } });
      toast("Contact updated");
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit +${contact.phone}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Tags" hint="Comma separated"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
        <Field label="Custom fields" hint="One key=value per line. Use them in templates as {{key}}.">
          <Textarea rows={4} value={attrs} onChange={(e) => setAttrs(e.target.value)} placeholder={"city=London\ncoupon=SAVE10"} className="font-mono text-xs" />
        </Field>
        {error && <Alert color="red">{error}</Alert>}
      </div>
    </Modal>
  );
}

function OptInModal({ contact, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [source, setSource] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api(`/api/contacts/${contact._id}`, { method: "PATCH", json: { action: "opt_in", consentSource: source } });
      toast("Consent recorded");
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record consent"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!confirmed || source.trim().length < 3}>Mark as opted in</Button>
        </>
      }
    >
      <div className="space-y-4">
        {contact.consentStatus === "opted_out" && (
          <Alert color="yellow" title="This contact opted out">
            Only re-subscribe them if they have explicitly asked to receive messages again (for example by replying START).
          </Alert>
        )}
        <Field label="How was consent obtained?">
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Customer asked by phone on 2026-10-20" />
        </Field>
        <Checkbox label={`I confirm ${contact.name || "this person"} has agreed to receive marketing messages on WhatsApp`} checked={confirmed} onChange={setConfirmed} />
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"file" | "all" | "none">("file");
  const [source, setSource] = useState("");
  const [attest, setAttest] = useState(false);
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportRes | null>(null);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setFile(null);
    setResult(null);
    setError(null);
    setAttest(false);
    onClose();
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("consentMode", mode);
    fd.set("consentSource", source);
    fd.set("attest", String(attest));
    fd.set("tags", tags);
    try {
      const res = await fetch("/api/contacts/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok && !("created" in data)) throw new Error(data.error || "Import failed");
      setResult(data);
      if (res.ok) {
        toast(`Imported: ${data.created} new, ${data.updated} updated`);
        onDone();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const needsAttest = mode !== "none";

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import contacts from CSV"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={close}>{result ? "Close" : "Cancel"}</Button>
          <Button onClick={submit} loading={busy} disabled={!file || (needsAttest && (!attest || source.trim().length < 3))}>Import</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-slate-800">CSV format</p>
            <a href="/contacts-template.csv" download className="font-medium text-emerald-700 hover:underline">
              Download CSV template
            </a>
          </div>
          <p className="mt-1">
            Required column: <code>phone</code> (with country code). Optional: <code>name</code>, <code>tags</code> (separated by ;),{" "}
            <code>consent</code> (yes / no / opted_out). Any other column becomes a custom field usable as <code>{"{{column_name}}"}</code>.
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-2 font-mono text-[11px] text-slate-700">{`phone,name,tags,consent,city
+14155550123,Jane Doe,vip;newsletter,yes,San Francisco
+447911123456,John Smith,newsletter,no,London`}</pre>
        </div>

        <Field label="CSV file" hint="Max 5 MB">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-emerald-700 hover:file:bg-emerald-100"
          />
        </Field>

        <Field label="Consent">
          <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="file">Use the CSV &quot;consent&quot; column (missing = no consent)</option>
            <option value="all">Every contact in this file has opted in</option>
            <option value="none">Import without consent (they will not receive campaigns)</option>
          </Select>
        </Field>

        {needsAttest && (
          <>
            <Field label="Consent source" hint="Stored on each opted-in contact as your consent record.">
              <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Newsletter signup form with WhatsApp checkbox" />
            </Field>
            <Checkbox
              label="I confirm these contacts gave explicit permission to receive marketing messages from us on WhatsApp"
              description="People who previously opted out stay opted out regardless of this file."
              checked={attest}
              onChange={setAttest}
            />
          </>
        )}

        <Field label="Add tags to all imported contacts" hint="Optional, comma separated">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. import-oct-2026" />
        </Field>

        {error && <Alert color="red">{error}</Alert>}
        {result && (
          <Alert color={result.created + result.updated > 0 ? "green" : "red"} title="Import result">
            <ul className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
              <li>New: {result.created}</li>
              <li>Updated: {result.updated}</li>
              <li>Invalid rows: {result.invalid}</li>
              <li>Duplicates in file: {result.duplicates}</li>
              <li>Kept opted out: {result.suppressed}</li>
              <li>Marked opted out: {result.optedOut}</li>
            </ul>
            {result.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer font-medium">Row errors ({result.errors.length})</summary>
                <ul className="mt-1 max-h-40 overflow-y-auto text-xs">
                  {result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
                </ul>
              </details>
            )}
          </Alert>
        )}
      </div>
    </Modal>
  );
}

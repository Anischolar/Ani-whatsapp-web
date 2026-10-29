"use client";

import Link from "next/link";
import { useState } from "react";
import { api, formatDate, useApi } from "@/lib/client";
import { renderTemplate, extractPlaceholders } from "@/lib/template";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Spinner, Textarea } from "@/components/ui";
import { MessagePreview } from "@/components/message-preview";
import { MediaPicker, mediaUrl } from "@/components/media-picker";
import { PlaceholderChips } from "@/components/placeholder-help";
import { useToast } from "@/components/toast";

type Template = { _id: string; name: string; body: string; mediaId: string | null; updatedAt: string };
const SAMPLE = { name: "Jane Doe", phone: "14155550123", attributes: { city: "San Francisco" } };

export default function TemplatesPage() {
  const toast = useToast();
  const { data, loading, reload } = useApi<{ items: Template[] }>("/api/templates");
  const [editing, setEditing] = useState<Partial<Template> | null>(null);

  async function remove(t: Template) {
    if (!confirm(`Delete template "${t.name}"? Existing campaigns keep their own copy of the message.`)) return;
    try {
      await api(`/api/templates/${t._id}`, { method: "DELETE" });
      toast("Template deleted");
      void reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Message templates"
        description="Reusable messages with personalised placeholders like {{name}}."
        actions={<Button onClick={() => setEditing({ name: "", body: "", mediaId: null })}>New template</Button>}
      />
      {loading && !data ? (
        <div className="flex justify-center py-16 text-slate-400"><Spinner /></div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title="No templates yet" description="Create a template to reuse it across campaigns." action={<Button onClick={() => setEditing({ name: "", body: "", mediaId: null })}>New template</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <Card key={t._id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2 px-4 pt-4">
                <h3 className="truncate font-semibold text-slate-900">{t.name}</h3>
                {t.mediaId && <Badge color="blue">Image</Badge>}
              </div>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap px-4 text-sm text-slate-600">{t.body}</p>
              <div className="mt-2 flex flex-wrap gap-1 px-4">
                {extractPlaceholders(t.body).map((k) => <Badge key={k}>{`{{${k}}}`}</Badge>)}
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 pt-3">
                <span className="text-xs text-slate-400">{formatDate(t.updatedAt)}</span>
                <div className="flex gap-1">
                  <Link href={`/campaigns/new?template=${t._id}`}><Button variant="ghost" size="sm">Use</Button></Link>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>Edit</Button>
                  <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => remove(t)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <TemplateEditor template={editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />
    </>
  );
}

function TemplateEditor({ template, onClose, onSaved }: { template: Partial<Template> | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<Partial<Template> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Reset local state whenever a different template is opened.
  const [openedFor, setOpenedFor] = useState<Partial<Template> | null>(null);
  if (template !== openedFor) {
    setOpenedFor(template);
    setState(template);
    setError(null);
  }
  if (!state) return null;

  const preview = renderTemplate(state.body || "", SAMPLE);

  async function save() {
    if (!state) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { name: state.name, body: state.body, mediaId: state.mediaId ?? null };
      if (state._id) await api(`/api/templates/${state._id}`, { method: "PUT", json: payload });
      else await api("/api/templates", { method: "POST", json: payload });
      toast("Template saved");
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
      wide
      title={state._id ? "Edit template" : "New template"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!state.name?.trim() || !state.body?.trim()}>Save template</Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Field label="Template name">
            <Input value={state.name || ""} onChange={(e) => setState({ ...state, name: e.target.value })} placeholder="e.g. Diwali sale" />
          </Field>
          <Field label={state.mediaId ? "Caption" : "Message"} hint={`${(state.body || "").length}/4096 characters${state.mediaId && (state.body || "").length > 1024 ? " · captions over 1024 characters may be truncated" : ""}`}>
            <Textarea id="tpl-body" rows={8} value={state.body || ""} onChange={(e) => setState({ ...state, body: e.target.value })} placeholder={"Hi {{first_name}}! 🎉\n\nOur *weekend sale* starts now…"} />
          </Field>
          <PlaceholderChips textareaId="tpl-body" value={state.body || ""} onChange={(body) => setState({ ...state, body })} />
          <Field label="Default image (optional)">
            <MediaPicker value={state.mediaId ?? null} onChange={(mediaId) => setState({ ...state, mediaId })} />
          </Field>
          {error && <Alert color="red">{error}</Alert>}
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Preview</p>
          <MessagePreview text={preview.text} imageUrl={state.mediaId ? mediaUrl(state.mediaId) : null} recipient="Jane Doe (sample)" />
          {preview.missing.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              Sample contact has no value for: {preview.missing.map((m) => `{{${m}}}`).join(", ")}. Contacts without it get an empty value unless you add a fallback.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">The opt-out footer is added when sending (configurable per campaign).</p>
        </div>
      </div>
    </Modal>
  );
}

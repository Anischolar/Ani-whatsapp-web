"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi } from "@/lib/client";
import { Alert, Button, Card, CardHeader, Checkbox, Field, Input, Modal, PageHeader, Select, Textarea, cn } from "@/components/ui";
import { MessagePreview } from "@/components/message-preview";
import { MediaPicker, mediaUrl } from "@/components/media-picker";
import { PlaceholderChips } from "@/components/placeholder-help";
import { useToast } from "@/components/toast";

type Template = { _id: string; name: string; body: string; mediaId: string | null };
type Preview = {
  audienceCount: number;
  excludedNoConsent: number;
  placeholders: string[];
  previews: { name: string; phone: string; text: string; missing: string[]; sample: boolean }[];
};

function Composer() {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const { data: templates } = useApi<{ items: Template[] }>("/api/templates");
  const { data: tagData } = useApi<{ tags: { tag: string; total: number; optedIn: number }[] }>("/api/contacts/tags");
  const { data: wa } = useApi<{ status: string }>("/api/whatsapp", 5000);

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [body, setBody] = useState("");
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [minDelay, setMinDelay] = useState(8);
  const [maxDelay, setMaxDelay] = useState(20);
  const [footer, setFooter] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [saving, setSaving] = useState<null | "draft" | "start">(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates?.items.find((x) => x._id === id);
    if (t) {
      setBody(t.body);
      setMediaId(t.mediaId);
      if (!name) setName(t.name);
    }
  }

  // Preselect a template passed via ?template=
  const preselect = params.get("template");
  const [preselected, setPreselected] = useState(false);
  if (!preselected && preselect && templates) {
    setPreselected(true);
    applyTemplate(preselect);
  }

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const p = await api<Preview>("/api/campaigns/preview", { method: "POST", json: { body, audienceTags: tags, appendOptOutFooter: footer } });
        setPreview(p);
        setPreviewIdx((i) => Math.min(i, p.previews.length - 1));
      } catch {
        /* preview is best effort */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [body, tags, footer]);

  async function submit(startNow: boolean) {
    setSaving(startNow ? "start" : "draft");
    setError(null);
    try {
      const res = await api<{ item: { _id: string } }>("/api/campaigns", {
        method: "POST",
        json: { name, templateId: templateId || null, body, mediaId, audienceTags: tags, minDelaySec: minDelay, maxDelaySec: maxDelay, appendOptOutFooter: footer, startNow },
      });
      toast(startNow ? "Campaign started" : "Draft saved");
      router.push(`/campaigns/${res.item._id}`);
    } catch (e) {
      setError((e as Error).message);
      setConfirmOpen(false);
    } finally {
      setSaving(null);
    }
  }

  const current = preview?.previews[Math.max(0, previewIdx)];
  const valid = name.trim() && body.trim() && minDelay >= 3 && maxDelay >= minDelay;
  const estMinutes = preview ? Math.ceil((preview.audienceCount * (minDelay + maxDelay)) / 2 / 60) : 0;

  return (
    <>
      <PageHeader title="New campaign" description="Compose a message, choose an audience of opted-in contacts and preview before sending." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Message" />
            <div className="space-y-4 p-5">
              <Field label="Campaign name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. November newsletter" />
              </Field>
              <Field label="Start from template">
                <Select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">— Write from scratch —</option>
                  {templates?.items.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label={mediaId ? "Caption" : "Message text"} hint={`${body.length}/4096`}>
                <Textarea id="campaign-body" rows={7} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {{first_name}}, …" />
              </Field>
              <PlaceholderChips textareaId="campaign-body" value={body} onChange={setBody} />
              <Field label="Image (optional)">
                <MediaPicker value={mediaId} onChange={setMediaId} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Audience" description="Only contacts who have opted in are included. Opted-out numbers are always excluded." />
            <div className="space-y-3 p-5">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setTags([])} className={cn("rounded-full px-3 py-1 text-sm ring-1 ring-inset", tags.length === 0 ? "bg-emerald-600 text-white ring-emerald-600" : "text-slate-600 ring-slate-300 hover:bg-slate-50")}>
                  All opted-in contacts
                </button>
                {tagData?.tags.map((t) => {
                  const on = tags.includes(t.tag);
                  return (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => setTags(on ? tags.filter((x) => x !== t.tag) : [...tags, t.tag])}
                      className={cn("rounded-full px-3 py-1 text-sm ring-1 ring-inset", on ? "bg-emerald-600 text-white ring-emerald-600" : "text-slate-600 ring-slate-300 hover:bg-slate-50")}
                    >
                      {t.tag} <span className="opacity-70">({t.optedIn})</span>
                    </button>
                  );
                })}
              </div>
              {tags.length > 1 && <p className="text-xs text-slate-500">Contacts with any of the selected tags are included.</p>}
              {preview && (
                <p className="text-sm text-slate-700">
                  <strong className="tabular-nums">{preview.audienceCount.toLocaleString()}</strong> eligible recipient(s)
                  {preview.excludedNoConsent > 0 && <span className="text-slate-500"> · {preview.excludedNoConsent.toLocaleString()} excluded (no consent or opted out)</span>}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Sending" description="Random delay between messages helps avoid WhatsApp spam detection." />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Min delay (seconds)">
                <Input type="number" min={3} max={600} value={minDelay} onChange={(e) => setMinDelay(Number(e.target.value))} />
              </Field>
              <Field label="Max delay (seconds)" error={maxDelay < minDelay ? "Must be ≥ min delay" : null}>
                <Input type="number" min={3} max={900} value={maxDelay} onChange={(e) => setMaxDelay(Number(e.target.value))} />
              </Field>
              <div className="sm:col-span-2">
                <Checkbox label="Append opt-out instructions" description="Adds “Reply STOP to unsubscribe.” Strongly recommended for marketing messages." checked={footer} onChange={setFooter} />
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <div className="space-y-4 lg:sticky lg:top-6">
            <Card>
              <CardHeader
                title="Preview"
                actions={
                  preview && preview.previews.length > 1 ? (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" disabled={previewIdx <= 0} onClick={() => setPreviewIdx(previewIdx - 1)} aria-label="Previous recipient">‹</Button>
                      <span className="text-xs text-slate-500">{previewIdx + 1}/{preview.previews.length}</span>
                      <Button variant="ghost" size="sm" disabled={previewIdx >= preview.previews.length - 1} onClick={() => setPreviewIdx(previewIdx + 1)} aria-label="Next recipient">›</Button>
                    </div>
                  ) : undefined
                }
              />
              <div className="p-4">
                <MessagePreview
                  text={current?.text ?? body}
                  imageUrl={mediaId ? mediaUrl(mediaId) : null}
                  recipient={current ? `${current.name || "+" + current.phone}${current.sample ? " (sample)" : ""}` : undefined}
                />
                {current && current.missing.length > 0 && (
                  <p className="mt-2 text-xs text-amber-700">Missing for this contact: {current.missing.map((m) => `{{${m}}}`).join(", ")}</p>
                )}
              </div>
            </Card>

            {wa && wa.status !== "ready" && (
              <Alert color="yellow">WhatsApp is not connected. A started campaign will wait in the queue until it is.</Alert>
            )}
            {error && <Alert color="red">{error}</Alert>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" className="flex-1" disabled={!valid} loading={saving === "draft"} onClick={() => submit(false)}>Save as draft</Button>
              <Button className="flex-1" disabled={!valid || !preview?.audienceCount} onClick={() => { setConfirmed(false); setConfirmOpen(true); }}>Review &amp; send</Button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Start campaign?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => submit(true)} loading={saving === "start"} disabled={!confirmed}>Start sending</Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-slate-700">
          <p>
            This will send <strong>{name}</strong> to <strong>{preview?.audienceCount.toLocaleString()}</strong> opted-in recipient(s), one every {minDelay}–{maxDelay} seconds
            (about {estMinutes} min). You can pause or cancel at any time.
          </p>
          <Checkbox label="I confirm every recipient has agreed to receive marketing messages from us on WhatsApp" checked={confirmed} onChange={setConfirmed} />
        </div>
      </Modal>
    </>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense>
      <Composer />
    </Suspense>
  );
}

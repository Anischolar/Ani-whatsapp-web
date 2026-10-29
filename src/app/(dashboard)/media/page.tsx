"use client";

import { useRef, useState } from "react";
import { api, formatBytes, formatDate, useApi } from "@/lib/client";
import { Button, Card, EmptyState, PageHeader, Spinner, cn } from "@/components/ui";
import { mediaUrl, type MediaItem } from "@/components/media-picker";
import { useToast } from "@/components/toast";

const MAX_MB = 5;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

export default function MediaPage() {
  const toast = useToast();
  const { data, loading, reload } = useApi<{ items: MediaItem[] }>("/api/media");
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | File[]) {
    const list = [...files];
    for (const f of list) {
      if (!ACCEPT.includes(f.type)) {
        toast(`${f.name}: only JPEG, PNG or WebP allowed`, "error");
        continue;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        toast(`${f.name}: larger than ${MAX_MB} MB`, "error");
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.set("file", f);
        await api("/api/media", { method: "POST", body: fd });
        toast(`Uploaded ${f.name}`);
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, "error");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    void reload();
  }

  async function remove(m: MediaItem) {
    if (!confirm(`Delete ${m.originalName}?`)) return;
    try {
      await api(`/api/media/${m._id}`, { method: "DELETE" });
      toast("Image deleted");
      void reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader title="Images" description="Promotional images stored on this server. JPEG, PNG or WebP, up to 5 MB." actions={<Button onClick={() => inputRef.current?.click()} loading={uploading > 0}>Upload images</Button>} />
      <input ref={inputRef} type="file" accept={ACCEPT.join(",")} multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "mb-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center text-sm transition-colors",
          drag ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-white text-slate-500 hover:border-slate-400",
        )}
      >
        {uploading > 0 ? <Spinner className="size-6 text-emerald-600" /> : <p><span className="font-medium text-emerald-700">Click to upload</span> or drag and drop images here</p>}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16 text-slate-400"><Spinner /></div>
      ) : items.length === 0 ? (
        <Card><EmptyState title="No images yet" description="Uploaded images can be attached to templates and campaigns." /></Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => (
            <Card key={m._id} className="overflow-hidden">
              <a href={mediaUrl(m._id)} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(m._id)} alt={m.originalName} loading="lazy" className="aspect-square w-full bg-slate-100 object-cover" />
              </a>
              <div className="space-y-1 p-3">
                <p className="truncate text-sm font-medium text-slate-800" title={m.originalName}>{m.originalName}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(m.size)}{m.width ? ` · ${m.width}×${m.height}` : ""}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{formatDate(m.createdAt)}</span>
                  <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => remove(m)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

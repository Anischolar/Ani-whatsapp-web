"use client";

import Link from "next/link";
import { useApi } from "@/lib/client";
import { cn } from "./ui";

export type MediaItem = { _id: string; originalName: string; mimeType: string; size: number; width?: number; height?: number; createdAt: string };

export const mediaUrl = (id: string) => `/api/media/${id}`;

export function MediaPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { data } = useApi<{ items: MediaItem[] }>("/api/media");
  const items = data?.items ?? [];
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "flex aspect-square items-center justify-center rounded-lg border-2 text-xs font-medium text-slate-500",
            value === null ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-dashed border-slate-300 hover:border-slate-400",
          )}
        >
          No image
        </button>
        {items.map((m) => (
          <button
            key={m._id}
            type="button"
            onClick={() => onChange(m._id)}
            title={m.originalName}
            className={cn("aspect-square overflow-hidden rounded-lg border-2", value === m._id ? "border-emerald-500 ring-2 ring-emerald-200" : "border-transparent hover:border-slate-300")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(m._id)} alt={m.originalName} className="size-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {items.length === 0 ? "No images uploaded yet. " : ""}
        <Link href="/media" className="font-medium text-emerald-700 hover:underline">Manage images</Link>
      </p>
    </div>
  );
}

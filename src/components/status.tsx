"use client";

import { Badge, type BadgeColor } from "./ui";

const campaignColors: Record<string, BadgeColor> = {
  draft: "gray",
  running: "blue",
  paused: "yellow",
  completed: "green",
  cancelled: "red",
};

export function CampaignStatusBadge({ status }: { status: string }) {
  return (
    <Badge color={campaignColors[status] ?? "gray"}>
      {status === "running" && <span className="size-1.5 animate-pulse rounded-full bg-sky-500" />}
      {status}
    </Badge>
  );
}

const consentLabels: Record<string, [string, BadgeColor]> = {
  opted_in: ["Opted in", "green"],
  pending: ["No consent", "yellow"],
  opted_out: ["Opted out", "red"],
};

export function ConsentBadge({ status }: { status: string }) {
  const [label, color] = consentLabels[status] ?? [status, "gray"];
  return <Badge color={color}>{label}</Badge>;
}

const logColors: Record<string, BadgeColor> = {
  pending: "gray",
  sending: "blue",
  sent: "green",
  failed: "red",
  skipped: "yellow",
};

export function LogStatusBadge({ status }: { status: string }) {
  return <Badge color={logColors[status] ?? "gray"}>{status}</Badge>;
}

export const waStatusLabel: Record<string, [string, BadgeColor]> = {
  stopped: ["Not connected", "gray"],
  initializing: ["Starting…", "blue"],
  qr: ["Scan QR code", "yellow"],
  authenticating: ["Authenticating…", "blue"],
  ready: ["Connected", "green"],
  disconnected: ["Disconnected", "red"],
  auth_failure: ["Auth failed", "red"],
  error: ["Error", "red"],
};

export function WaStatusBadge({ status }: { status: string }) {
  const [label, color] = waStatusLabel[status] ?? [status, "gray"];
  return <Badge color={color}>{label}</Badge>;
}

export function ProgressBar({ stats, total }: { stats: Record<string, number>; total: number }) {
  const t = Math.max(total, 1);
  const seg = (n: number) => `${(n / t) * 100}%`;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-label="Progress">
      <div className="bg-emerald-500" style={{ width: seg(stats.sent || 0) }} />
      <div className="bg-rose-500" style={{ width: seg(stats.failed || 0) }} />
      <div className="bg-amber-400" style={{ width: seg(stats.skipped || 0) }} />
    </div>
  );
}

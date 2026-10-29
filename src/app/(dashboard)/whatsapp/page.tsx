"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Spinner, cn } from "@/components/ui";
import { WaStatusBadge } from "@/components/status";
import { useToast } from "@/components/toast";

type WAState = {
  status: string;
  qrDataUrl: string | null;
  pairingCode: string | null;
  loadingPercent: number | null;
  account: { name: string; phone: string } | null;
  lastError: string | null;
  mock: boolean;
  worker: { state: string; detail: string };
};

type Action = "connect" | "disconnect" | "logout" | "reset";

export default function WhatsAppPage() {
  const toast = useToast();
  const { data, reload, setData } = useApi<WAState>("/api/whatsapp", 2000);
  const [busy, setBusy] = useState<string | null>(null);
  const [method, setMethod] = useState<"qr" | "phone">("qr");
  const [pairPhone, setPairPhone] = useState("");

  async function act(action: Action) {
    if (action === "logout" && !confirm("Log out this WhatsApp account? You will need to link it again.")) return;
    if (action === "reset" && !confirm("Delete the saved WhatsApp session on the server and start fresh?")) return;
    setBusy(action);
    try {
      const body = action === "connect" && method === "phone" ? { action, pairPhone } : { action };
      setData(await api<WAState>("/api/whatsapp", { method: "POST", json: body }));
      if (action === "connect") toast("Starting WhatsApp… this can take up to a minute.", "info");
      if (action === "logout") toast("Logged out of WhatsApp");
      if (action === "reset") toast("Session cleared. Click Connect to link again.");
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  const status = data?.status ?? "stopped";
  const starting = status === "initializing" || status === "authenticating";
  const canConnect = ["stopped", "disconnected", "auth_failure", "error"].includes(status);
  const code = data?.pairingCode;

  return (
    <>
      <PageHeader title="WhatsApp connection" description="Link a WhatsApp account by scanning a QR code or entering a pairing code on your phone." />
      {data?.mock && (
        <div className="mb-6">
          <Alert color="blue" title="Mock mode">
            WHATSAPP_MOCK is enabled. No real messages are sent; linking auto-confirms after a few seconds.
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Status" actions={<WaStatusBadge status={status} />} />
          <div className="flex flex-col items-center px-5 py-8 text-center">
            {!data && <Spinner />}

            {status === "qr" && data?.qrDataUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.qrDataUrl} alt="WhatsApp QR code" className="size-64 rounded-xl border border-slate-200 bg-white p-2 sm:size-72" />
                <p className="mt-4 max-w-sm text-sm text-slate-600">
                  WhatsApp refreshes this code about every 20 seconds for security. That&apos;s normal: scan whichever code is showing.
                </p>
              </>
            )}

            {status === "qr" && code && (
              <div className="py-4">
                <p className="text-sm text-slate-600">Enter this code on your phone:</p>
                <p className="mt-3 select-all font-mono text-4xl font-semibold tracking-[0.2em] text-slate-900">
                  {code.slice(0, 4)}-{code.slice(4)}
                </p>
                <p className="mx-auto mt-4 max-w-sm text-xs text-slate-500">
                  WhatsApp should show a notification. If not: WhatsApp → Settings → Linked devices → Link a device →{" "}
                  <strong>Link with phone number instead</strong>.
                </p>
              </div>
            )}

            {status === "qr" && !data?.qrDataUrl && !code && (
              <div className="flex flex-col items-center gap-3 py-10 text-slate-600">
                <Spinner className="size-8 text-emerald-600" />
                <p className="text-sm">Requesting code…</p>
              </div>
            )}

            {starting && (
              <div className="flex flex-col items-center gap-3 py-10 text-slate-600">
                <Spinner className="size-8 text-emerald-600" />
                <p className="text-sm">
                  {status === "initializing" ? "Launching WhatsApp Web…" : "Linked! Loading chats…"}
                  {data?.loadingPercent != null && ` ${data.loadingPercent}%`}
                </p>
              </div>
            )}

            {status === "ready" && data?.account && (
              <div className="py-6">
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <p className="mt-4 text-lg font-semibold text-slate-900">{data.account.name || "WhatsApp account"}</p>
                <p className="text-sm text-slate-500">+{data.account.phone}</p>
              </div>
            )}

            {canConnect && data && (
              <div className="w-full max-w-sm space-y-4">
                <p className="text-sm text-slate-600">
                  {status === "stopped" ? "WhatsApp is not connected." : data.lastError || "The connection was lost."}
                </p>
                <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
                  {(["qr", "phone"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={cn("rounded-md py-1.5", method === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                    >
                      {m === "qr" ? "Scan QR code" : "Use phone number"}
                    </button>
                  ))}
                </div>
                {method === "phone" && (
                  <div className="text-left">
                    <Field label="WhatsApp number to link" hint="The phone you'll send from, with country code.">
                      <Input value={pairPhone} onChange={(e) => setPairPhone(e.target.value)} placeholder="+92 300 1234567" inputMode="tel" />
                    </Field>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {canConnect && (
                <Button onClick={() => act("connect")} loading={busy === "connect"} disabled={method === "phone" && pairPhone.trim().length < 6}>
                  {method === "phone" ? "Get pairing code" : status === "stopped" ? "Connect WhatsApp" : "Reconnect"}
                </Button>
              )}
              {(status === "qr" || starting) && (
                <Button variant="secondary" onClick={() => act("disconnect")} loading={busy === "disconnect"}>
                  Cancel
                </Button>
              )}
              {status === "ready" && (
                <>
                  <Button variant="secondary" onClick={() => act("disconnect")} loading={busy === "disconnect"}>
                    Stop client
                  </Button>
                  <Button variant="danger" onClick={() => act("logout")} loading={busy === "logout"}>
                    Log out device
                  </Button>
                </>
              )}
              {status !== "ready" && data && (
                <Button variant="ghost" onClick={() => act("reset")} loading={busy === "reset"}>
                  Reset session
                </Button>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="How to link" />
            <ol className="list-decimal space-y-2 px-5 py-4 pl-9 text-sm text-slate-600">
              <li>On your phone open WhatsApp → <strong>Settings</strong> → <strong>Linked devices</strong> → <strong>Link a device</strong>.</li>
              <li>Scan the QR code, or tap <strong>Link with phone number instead</strong> and type the pairing code.</li>
              <li>The session is saved on the server, so you only link once. It reconnects automatically after restarts.</li>
            </ol>
          </Card>
          <Card>
            <CardHeader title={"“Couldn’t link device”?"} />
            <ul className="list-disc space-y-2 px-5 py-4 pl-9 text-sm text-slate-600">
              <li>Too many attempts make WhatsApp block linking for a while. Wait 1–2 hours, then try once.</li>
              <li>Update WhatsApp on the phone and check its internet connection. Turn off any VPN on phone and server.</li>
              <li>Remove old entries under Linked devices (the limit is 4).</li>
              <li>Click <strong>Reset session</strong>, then link again. Try the phone-number method if the QR keeps failing.</li>
              <li>Test linking at web.whatsapp.com in a normal browser. If that fails too, the problem is with the phone or account, not this app.</li>
            </ul>
          </Card>
          <p className="px-1 text-xs text-slate-500">
            Only message people who have agreed to hear from you. Bulk unsolicited messaging breaks WhatsApp&apos;s terms and can get the number banned.
          </p>
        </div>
      </div>
    </>
  );
}

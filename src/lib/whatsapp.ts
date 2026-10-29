import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import type { Client as WAClient } from "whatsapp-web.js";
import { env } from "./env";

export type WAStatus =
  | "stopped"
  | "initializing"
  | "qr"
  | "authenticating"
  | "ready"
  | "disconnected"
  | "auth_failure"
  | "error";

export interface WAState {
  status: WAStatus;
  qrDataUrl: string | null;
  /** 8-character code to type on the phone when linking by phone number instead of QR. */
  pairingCode: string | null;
  loadingPercent: number | null;
  account: { name: string; phone: string } | null;
  lastError: string | null;
  updatedAt: string;
  mock: boolean;
}

type InboundHandler = (phone: string, body: string) => Promise<string | null>;

class WhatsAppManager {
  private client: WAClient | null = null;
  private starting: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private mockTimer: NodeJS.Timeout | null = null;
  private inboundHandler: InboundHandler | null = null;
  state: WAState = {
    status: "stopped",
    qrDataUrl: null,
    pairingCode: null,
    loadingPercent: null,
    account: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
    mock: env.waMock,
  };

  private set(patch: Partial<WAState>) {
    this.state = { ...this.state, ...patch, updatedAt: new Date().toISOString() };
  }

  get isReady() {
    return this.state.status === "ready";
  }

  hasSavedSession(): boolean {
    try {
      return fs.existsSync(this.sessionPath()) && fs.readdirSync(this.sessionPath()).length > 0;
    } catch {
      return false;
    }
  }

  private sessionPath() {
    return path.join(env.sessionDir, "session-bulk-sender");
  }

  onInbound(handler: InboundHandler) {
    this.inboundHandler = handler;
  }

  /** Starts the client. With `pairPhone` (E.164 digits) WhatsApp issues a pairing code instead of a QR code. */
  async start(pairPhone?: string): Promise<void> {
    if (this.client || this.starting || this.state.status === "ready") return this.starting ?? undefined;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.starting = (env.waMock ? this.startMock(pairPhone) : this.startReal(pairPhone)).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async startMock(pairPhone?: string) {
    this.set({
      status: "qr",
      lastError: null,
      qrDataUrl: pairPhone ? null : await QRCode.toDataURL("mock-whatsapp-session"),
      pairingCode: pairPhone ? "MOCK1234" : null,
    });
    this.mockTimer = setTimeout(() => {
      this.set({ status: "ready", qrDataUrl: null, pairingCode: null, account: { name: "Mock Account", phone: "15550000000" } });
    }, 4000);
  }

  private async startReal(pairPhone?: string) {
    fs.mkdirSync(env.sessionDir, { recursive: true });
    this.set({ status: "initializing", lastError: null, qrDataUrl: null, pairingCode: null, loadingPercent: null });
    const wweb = await import("whatsapp-web.js");
    const { Client, LocalAuth } = (wweb as unknown as { default?: typeof wweb }).default ?? wweb;

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: "bulk-sender", dataPath: env.sessionDir }),
      puppeteer: {
        headless: env.waHeadless,
        executablePath: env.chromePath,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      },
      pairWithPhoneNumber: pairPhone ? { phoneNumber: pairPhone, showNotification: true } : undefined,
    });
    this.client = client;

    client.on("qr", async (qr: string) => {
      this.set({ status: "qr", qrDataUrl: await QRCode.toDataURL(qr, { margin: 1, width: 320 }) });
    });
    client.on("code", (code: string) => {
      this.set({ status: "qr", pairingCode: code, qrDataUrl: null });
    });
    client.on("loading_screen", (percent: number | string) => {
      this.set({ loadingPercent: Number(percent) || 0 });
    });
    client.on("authenticated", () => this.set({ status: "authenticating", qrDataUrl: null, pairingCode: null }));
    client.on("auth_failure", (msg: string) => {
      this.set({ status: "auth_failure", lastError: msg || "Authentication failed", qrDataUrl: null, pairingCode: null });
    });
    client.on("ready", () => {
      const info = client.info;
      this.set({
        status: "ready",
        qrDataUrl: null,
        pairingCode: null,
        loadingPercent: null,
        account: info ? { name: info.pushname || "", phone: info.wid?.user || "" } : null,
      });
      console.log("[whatsapp] client ready");
    });
    client.on("disconnected", async (reason: string) => {
      console.warn("[whatsapp] disconnected:", reason);
      this.set({ status: "disconnected", lastError: `Disconnected: ${reason}`, account: null, qrDataUrl: null });
      await this.destroyClient();
      // If the user logged out from the phone the session is gone, so wait for a manual reconnect.
      if (reason !== "LOGOUT") this.reconnectTimer = setTimeout(() => void this.start(), 15_000);
    });
    client.on("message", async (msg) => {
      try {
        if (msg.fromMe || msg.isStatus || !this.inboundHandler) return;
        if (msg.from.endsWith("@g.us") || msg.from.endsWith("@broadcast")) return;
        let phone = msg.from.endsWith("@c.us") ? msg.from.split("@")[0] : "";
        if (!phone) phone = (await msg.getContact())?.number || "";
        if (!phone) return;
        const reply = await this.inboundHandler(phone, msg.body || "");
        if (reply) await client.sendMessage(msg.from, reply);
      } catch (err) {
        console.error("[whatsapp] inbound handler failed", err);
      }
    });

    try {
      await client.initialize();
    } catch (err) {
      console.error("[whatsapp] initialize failed", err);
      this.set({ status: "error", lastError: (err as Error).message || "Failed to start WhatsApp client" });
      await this.destroyClient();
    }
  }

  private async destroyClient() {
    const c = this.client;
    this.client = null;
    if (c) await c.destroy().catch(() => undefined);
  }

  async stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.mockTimer) clearTimeout(this.mockTimer);
    await this.destroyClient();
    this.set({ status: "stopped", qrDataUrl: null, pairingCode: null, account: null, loadingPercent: null });
  }

  /** Logs the linked device out of WhatsApp and deletes the local session. */
  async logout() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.client) await this.client.logout().catch((e) => console.warn("[whatsapp] logout", e?.message));
    await this.stop();
    // LocalAuth normally removes the folder; on Windows Chrome can still hold locks, so retry.
    await fs.promises.rm(this.sessionPath(), { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined);
  }

  /** Resolves a phone number to a WhatsApp chat id, or null if the number isn't on WhatsApp. */
  async resolveChatId(phone: string): Promise<string | null> {
    if (env.waMock) return phone.endsWith("0000") ? null : `${phone}@c.us`;
    if (!this.client || !this.isReady) throw new Error("WhatsApp is not connected");
    const id = await this.client.getNumberId(phone);
    if (!id) return null;
    return id._serialized || (id.user && id.server ? `${id.user}@${id.server}` : null);
  }

  async send(chatId: string, text: string, imagePath?: string): Promise<string> {
    if (env.waMock) {
      await new Promise((r) => setTimeout(r, 250));
      if (chatId.split("@")[0].endsWith("9999")) throw new Error("Mock send failure");
      return `mock_${Date.now()}`;
    }
    if (!this.client || !this.isReady) throw new Error("WhatsApp is not connected");
    let msg;
    if (imagePath) {
      const { MessageMedia } = await import("whatsapp-web.js").then((m) => (m as unknown as { default?: typeof m }).default ?? m);
      const media = MessageMedia.fromFilePath(imagePath);
      msg = await this.client.sendMessage(chatId, media, { caption: text || undefined });
    } else {
      msg = await this.client.sendMessage(chatId, text);
    }
    // sendMessage resolving without throwing means WhatsApp accepted the message; newer WhatsApp Web
    // builds can return no message object, so the id is best effort.
    return msg?.id?._serialized ?? "";
  }
}

const g = globalThis as unknown as { __waManager?: WhatsAppManager };
export const whatsapp: WhatsAppManager = g.__waManager ?? (g.__waManager = new WhatsAppManager());

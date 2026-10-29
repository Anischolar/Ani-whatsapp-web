import path from "node:path";

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

// Runtime data dir; excluded from build tracing since it's never bundled.
const storageDir = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR || "./storage");

export const env = {
  mongodbUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/whatsapp_bulk",
  authSecret: process.env.AUTH_SECRET || "",
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  sessionHours: int("SESSION_HOURS", 12),

  storageDir,
  uploadDir: path.join(storageDir, "uploads"),
  sessionDir: path.join(storageDir, "wa-session"),
  maxUploadBytes: int("MAX_UPLOAD_MB", 5) * 1024 * 1024,
  maxCsvBytes: int("MAX_CSV_MB", 5) * 1024 * 1024,
  maxCsvRows: int("MAX_CSV_ROWS", 20000),

  defaultCountry: (process.env.DEFAULT_COUNTRY || "US").toUpperCase(),

  waAutoStart: bool("WA_AUTO_START", true),
  waMock: bool("WHATSAPP_MOCK", false),
  waHeadless: bool("WA_HEADLESS", true),
  chromePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,

  defaultMinDelaySec: int("SEND_MIN_DELAY_SEC", 8),
  defaultMaxDelaySec: int("SEND_MAX_DELAY_SEC", 20),
  dailySendLimit: int("DAILY_SEND_LIMIT", 1000),

  optOutKeywords: (process.env.OPT_OUT_KEYWORDS || "STOP,UNSUBSCRIBE,STOPALL,OPTOUT,OPT OUT,CANCEL,END,QUIT")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
  optInKeywords: (process.env.OPT_IN_KEYWORDS || "START,SUBSCRIBE,UNSTOP")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
  optOutFooter: process.env.OPT_OUT_FOOTER || "Reply STOP to unsubscribe.",
  optOutReply:
    process.env.OPT_OUT_REPLY ||
    "You have been unsubscribed and will no longer receive marketing messages from us. Reply START to subscribe again.",
  optInReply: process.env.OPT_IN_REPLY || "You are subscribed again. Reply STOP at any time to unsubscribe.",
};

export function assertAuthConfigured() {
  if (!env.authSecret || env.authSecret.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters long.");
  }
  if (!env.adminPasswordHash && !env.adminPassword) {
    throw new Error("Set ADMIN_PASSWORD_HASH (recommended) or ADMIN_PASSWORD.");
  }
}

import fs from "node:fs";
import { connectDB } from "./db";
import { env } from "./env";
import { handleInboundMessage } from "./consent";
import { recoverInterruptedSends, worker } from "./queue";
import { whatsapp } from "./whatsapp";

const g = globalThis as unknown as { __bootstrapped?: Promise<void> };

async function boot() {
  fs.mkdirSync(env.uploadDir, { recursive: true });
  fs.mkdirSync(env.sessionDir, { recursive: true });
  await connectDB();
  await recoverInterruptedSends();
  whatsapp.onInbound(handleInboundMessage);
  worker.start();
  if (env.waAutoStart && (whatsapp.hasSavedSession() || env.waMock)) {
    console.log("[bootstrap] restoring WhatsApp session");
    void whatsapp.start();
  }
}

/** Idempotent: starts the queue worker and restores the WhatsApp session once per process. */
export function ensureBackgroundServices(): Promise<void> {
  if (!g.__bootstrapped) {
    g.__bootstrapped = boot().catch((err) => {
      console.error("[bootstrap] failed", err);
      g.__bootstrapped = undefined;
    });
  }
  return g.__bootstrapped!;
}

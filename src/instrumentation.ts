export async function register() {
  // whatsapp-web.js + the queue worker need a long-lived Node.js process (`next start` / `next dev`).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureBackgroundServices } = await import("./lib/bootstrap");
    void ensureBackgroundServices();
  }
}

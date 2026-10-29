// Starts a local MongoDB for development/testing without installing MongoDB system-wide.
// Data persists in ./storage/dev-db. Not intended for production - use a real MongoDB there.
import fs from "node:fs";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";

const dbPath = path.resolve(process.env.STORAGE_DIR || "./storage", "dev-db");
fs.mkdirSync(dbPath, { recursive: true });
const port = Number(process.env.DEV_MONGO_PORT || 27017);

const server = await MongoMemoryServer.create({
  instance: { port, dbPath, storageEngine: "wiredTiger", ip: "127.0.0.1", launchTimeout: 60_000 },
});
console.log(`Dev MongoDB running at ${server.getUri()} (data: ${dbPath})`);
console.log("Press Ctrl+C to stop.");

const stop = async () => {
  await server.stop({ doCleanup: false });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);

// Integration check for keyword opt-out/opt-in + restart recovery. Needs MongoDB running:
//   npm run db:dev   then   npm run test:db
// The database is dropped, so this refuses to run unless MONGODB_URI names a *test* database.
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { env } from "../src/lib/env";
import { Contact, MessageLog, OptOut } from "../src/lib/models";
import { handleInboundMessage } from "../src/lib/consent";
import { recoverInterruptedSends } from "../src/lib/queue";

if (!/test/i.test(new URL(env.mongodbUri).pathname)) {
  console.error(`Refusing to run: MONGODB_URI (${env.mongodbUri}) must point at a database whose name contains "test".`);
  process.exit(1);
}

let failed = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed++;
}

async function main() {
  await connectDB();
  await mongoose.connection.dropDatabase();
  const phone = "14155552671";
  const c = await Contact.create({ phone, name: "Jane", consentStatus: "opted_in", consentSource: "test" });
  const campaignId = new mongoose.Types.ObjectId();
  await MessageLog.create({ campaignId, contactId: c._id, phone, status: "pending" });

  check("ignores ordinary messages", (await handleInboundMessage(phone, "hello, what time do you open?")) === null);
  const reply = await handleInboundMessage(phone, "  stop! ");
  check("STOP returns confirmation", !!reply && /unsubscribed/i.test(reply));
  check("contact opted out", (await Contact.findById(c._id))!.consentStatus === "opted_out");
  check("added to suppression list", !!(await OptOut.exists({ phone })));
  check("queued message skipped", (await MessageLog.findOne({ phone }))!.status === "skipped");

  const again = await handleInboundMessage(phone, "START");
  check("START re-subscribes", !!again && (await Contact.findById(c._id))!.consentStatus === "opted_in");
  check("removed from suppression list", !(await OptOut.exists({ phone })));
  check("START from unknown number ignored", (await handleInboundMessage("14155550199", "START")) === null);

  await MessageLog.create({ campaignId, contactId: new mongoose.Types.ObjectId(), phone: "1", status: "sending" });
  await recoverInterruptedSends();
  check("interrupted sends marked failed", (await MessageLog.countDocuments({ status: "sending" })) === 0);

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log(failed ? `${failed} failed` : "all passed");
  process.exit(failed ? 1 : 0);
}

void main();

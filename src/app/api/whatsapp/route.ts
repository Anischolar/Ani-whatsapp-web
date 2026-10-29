import { z } from "zod";
import { HttpError, json, readJson, route } from "@/lib/api";
import { whatsapp } from "@/lib/whatsapp";
import { worker } from "@/lib/queue";
import { normalizePhone } from "@/lib/phone";
import { env } from "@/lib/env";

export const GET = route(async () => json({ ...whatsapp.state, worker: worker.status }));

const schema = z.object({
  // reset = log out (if linked) and delete the saved session so the next connect starts clean
  action: z.enum(["connect", "disconnect", "logout", "reset"]),
  // Link with a pairing code sent to this number instead of scanning a QR code.
  pairPhone: z.string().max(30).optional(),
});

export const POST = route(async (req) => {
  const { action, pairPhone } = schema.parse(await readJson(req));
  if (action === "connect") {
    let phone: string | undefined;
    if (pairPhone) {
      phone = normalizePhone(pairPhone, env.defaultCountry) ?? undefined;
      if (!phone) throw new HttpError(400, "Invalid phone number. Include the country code, e.g. +923001234567");
    }
    void whatsapp.start(phone);
  }
  if (action === "disconnect") await whatsapp.stop();
  if (action === "logout" || action === "reset") await whatsapp.logout();
  return json({ ...whatsapp.state, worker: worker.status });
});

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { HttpError, json, readJson, route } from "@/lib/api";
import { assertAuthConfigured, env } from "@/lib/env";
import { SESSION_COOKIE, createSessionToken } from "@/lib/session";

const schema = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) });

// Simple in-memory brute-force protection: 5 failures per IP per 15 minutes.
const g = globalThis as unknown as { __loginFails?: Map<string, { n: number; until: number }> };
const fails = g.__loginFails ?? (g.__loginFails = new Map());
const WINDOW_MS = 15 * 60 * 1000;

function safeEqual(a: string, b: string) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export const POST = route(
  async (req) => {
    assertAuthConfigured();
    const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
    const rec = fails.get(ip);
    if (rec && rec.n >= 5 && rec.until > Date.now()) {
      throw new HttpError(429, "Too many failed attempts. Try again in a few minutes.");
    }

    const { username, password } = schema.parse(await readJson(req));
    const passOk = env.adminPasswordHash
      ? await bcrypt.compare(password, env.adminPasswordHash)
      : safeEqual(password, env.adminPassword);
    const ok = safeEqual(username, env.adminUsername) && passOk;

    if (!ok) {
      const cur = rec && rec.until > Date.now() ? rec : { n: 0, until: Date.now() + WINDOW_MS };
      fails.set(ip, { n: cur.n + 1, until: cur.until });
      throw new HttpError(401, "Invalid username or password");
    }
    fails.delete(ip);

    (await cookies()).set(SESSION_COOKIE, await createSessionToken(username, env.sessionHours), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
      path: "/",
      maxAge: env.sessionHours * 3600,
    });
    return json({ ok: true });
  },
  { auth: false },
);

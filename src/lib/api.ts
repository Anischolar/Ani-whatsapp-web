import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { connectDB } from "./db";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { ensureBackgroundServices } from "./bootstrap";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/**
 * Wraps a route handler with: admin session check (defense in depth on top of proxy.ts),
 * DB connection, background service bootstrap and uniform error responses.
 */
export function route<C = unknown>(handler: Handler<C>, opts: { auth?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      if (opts.auth !== false) {
        const token = (await cookies()).get(SESSION_COOKIE)?.value;
        if (!(await verifySessionToken(token))) throw new HttpError(401, "Unauthorized");
      }
      await connectDB();
      ensureBackgroundServices();
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      if (err instanceof ZodError) {
        const msg = err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
        return json({ error: msg }, 400);
      }
      if (err instanceof mongoose.Error.CastError) return json({ error: "Invalid id" }, 400);
      if ((err as { code?: number })?.code === 11000) return json({ error: "A record with that value already exists" }, 409);
      console.error("[api]", err);
      return json({ error: "Internal server error" }, 500);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function objectId(id: string) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid id");
  return new mongoose.Types.ObjectId(id);
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

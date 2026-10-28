import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return value ?? "dev-only-insecure-session-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Token format: `<userId>.<issuedAtMs>.<hmac>`. Signed so the cookie can't be edited to impersonate someone. */
export function createSessionToken(userId: string, issuedAt = Date.now()): string {
  const payload = `${userId}.${issuedAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null, now = Date.now()): string | null {
  if (!token) return null;
  const sigStart = token.lastIndexOf(".");
  if (sigStart <= 0) return null;
  const payload = token.slice(0, sigStart);
  const given = Buffer.from(token.slice(sigStart + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const tsStart = payload.lastIndexOf(".");
  const userId = payload.slice(0, tsStart);
  const issuedAt = Number(payload.slice(tsStart + 1));
  if (!userId || !Number.isFinite(issuedAt)) return null;
  if (now - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return null;
  return userId;
}

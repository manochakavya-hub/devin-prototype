import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Wraps a route handler so thrown HttpErrors become JSON responses and anything else a 500. */
export function withErrors<A extends unknown[]>(
  handler: (...args: A) => Promise<Response> | Response,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) return jsonError(err.status, err.code, err.message);
      console.error(err);
      return jsonError(500, "internal_error", "Internal server error");
    }
  };
}

/** Requires a JSON body. Rejecting other content types blocks plain cross-site form posts. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Expected application/json");
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_body", "Body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

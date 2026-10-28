import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_SECONDS, createSessionToken, verifySessionToken } from "@/platform/auth/session";

describe("session tokens", () => {
  it("round-trips a user id", () => {
    expect(verifySessionToken(createSessionToken("u_alice"))).toBe("u_alice");
  });

  it("rejects a token whose user id was edited", () => {
    const token = createSessionToken("u_alice");
    expect(verifySessionToken(token.replace("u_alice", "u_sara"))).toBeNull();
  });

  it("rejects garbage and expired tokens", () => {
    expect(verifySessionToken("u_sara")).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    const old = createSessionToken("u_alice", Date.now() - (SESSION_MAX_AGE_SECONDS + 1) * 1000);
    expect(verifySessionToken(old)).toBeNull();
  });
});

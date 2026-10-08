import { describe, expect, it } from "vitest";

import { decodeCredentials, encodeCredentials, MissingCredentialsError, parseCredentialInput } from "@/generation/credentials";
import { checkKey } from "@/generation/key-check";
import { unwrap, ActionError, AuthRequired } from "@/generation/result";

describe("credentials", () => {
  it("parses input and defaults to Higgsfield", () => {
    expect(parseCredentialInput({ apiKey: " id:secret " })).toEqual({ provider: "higgsfield", apiKey: "id:secret" });
    expect(parseCredentialInput({ provider: "openai", apiKey: "sk-1" }).provider).toBe("openai");
    expect(() => parseCredentialInput({ provider: "other", apiKey: "x" })).toThrow();
    expect(() => parseCredentialInput({ apiKey: "  " })).toThrow();
  });

  it("round-trips the cookie format and reads the old one", () => {
    const keys = { higgsfield: "id:secret", openai: "sk-1" };
    expect(decodeCredentials(encodeCredentials(keys))).toEqual(keys);
    expect(decodeCredentials(JSON.stringify({ apiKey: "id:secret" }))).toEqual({ higgsfield: "id:secret" });
    expect(decodeCredentials("garbage")).toBeNull();
    expect(decodeCredentials(undefined)).toBeNull();
  });
});

describe("unwrap", () => {
  it("returns values and rebuilds errors", () => {
    expect(unwrap({ ok: true, value: 3 })).toBe(3);
    expect(() => unwrap({ ok: false, error: "x", code: "missing-key", provider: "openai" })).toThrow(MissingCredentialsError);
    expect(() => unwrap({ ok: false, error: "Sign in", code: "auth" })).toThrow(AuthRequired);
    expect(() => unwrap({ ok: false, error: "Bad", code: "provider" })).toThrow(ActionError);
  });
});

describe("key check", () => {
  const fakeFetch = (status: number, body: unknown = {}) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("reads Higgsfield answers without spending credits", async () => {
    let seen = "";
    const spy = (async (url: string) => {
      seen = url;
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    expect((await checkKey("higgsfield", "id:secret", "https://api.higgsfield.ai", spy)).valid).toBe(true);
    expect(seen).toBe("https://api.higgsfield.ai/requests/00000000-0000-4000-8000-000000000000/status");
    expect((await checkKey("higgsfield", "id:secret", "https://h", fakeFetch(401))).valid).toBe(false);
  });

  it("reads other providers", async () => {
    expect((await checkKey("openai", "sk", "", fakeFetch(200))).valid).toBe(true);
    expect((await checkKey("google", "k", "", fakeFetch(400))).valid).toBe(false);
    expect((await checkKey("kie", "k", "", fakeFetch(200, { code: 401 }))).valid).toBe(false);
    expect((await checkKey("kie", "k", "", fakeFetch(200, { code: 200 }))).valid).toBe(true);
  });

  it("handles network failure", async () => {
    const down = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect((await checkKey("openai", "sk", "", down)).valid).toBe(false);
  });
});

import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { maskKey, openKey, sealKey, vaultSecret, VaultConfigError } from "@/generation/key-vault";

const secret = vaultSecret(randomBytes(32).toString("base64"));
const user = "11111111-1111-4111-8111-111111111111";

describe("key vault", () => {
  it("opens what it sealed", () => {
    const sealed = sealKey("id123:secret456", user, "higgsfield", secret);
    expect(sealed.ciphertext).not.toContain("secret456");
    expect(openKey(sealed, user, "higgsfield", secret)).toBe("id123:secret456");
  });

  it("uses a fresh IV each time", () => {
    const a = sealKey("same", user, "openai", secret);
    const b = sealKey("same", user, "openai", secret);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("will not open for another user, provider or secret", () => {
    const sealed = sealKey("sk-test", user, "openai", secret);
    expect(() => openKey(sealed, "22222222-2222-4222-8222-222222222222", "openai", secret)).toThrow();
    expect(() => openKey(sealed, user, "google", secret)).toThrow();
    expect(() => openKey(sealed, user, "openai", vaultSecret("another secret"))).toThrow();
  });

  it("will not open a tampered ciphertext", () => {
    const sealed = sealKey("sk-test-value", user, "openai", secret);
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[0] ^= 1;
    expect(() => openKey({ ...sealed, ciphertext: bytes.toString("base64") }, user, "openai", secret)).toThrow();
  });

  it("needs a secret", () => {
    expect(() => vaultSecret("")).toThrow(VaultConfigError);
    expect(() => vaultSecret(undefined)).toThrow(VaultConfigError);
    expect(vaultSecret("short passphrase")).toHaveLength(32);
  });

  it("masks keys", () => {
    expect(maskKey("higgsfield", "abcdefgh:0123456789wxyz")).toBe("abcd…:…wxyz");
    expect(maskKey("openai", "sk-proj-1234567890abcd")).toBe("sk-p…abcd");
    expect(maskKey("kie", "short")).toBe("…rt");
    expect(maskKey("openai", "sk-proj-1234567890abcd")).not.toContain("567890");
  });
});

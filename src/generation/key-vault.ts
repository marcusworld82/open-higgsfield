import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { ProviderId } from "./credentials";

/** Server-only. Provider keys are sealed with AES-256-GCM before they are
    written to Supabase. The secret lives in OHF_KEY_ENCRYPTION_SECRET and never
    leaves the server, so a database read alone does not reveal a key. The row's
    owner and provider are bound in as associated data, so a sealed key cannot
    be moved to another user or provider and still open. */

export type SealedKey = { ciphertext: string; iv: string; auth_tag: string };

export class VaultConfigError extends Error {
  constructor() {
    super("OHF_KEY_ENCRYPTION_SECRET is not set on the server");
    this.name = "VaultConfigError";
  }
}

export function vaultSecret(raw = process.env.OHF_KEY_ENCRYPTION_SECRET): Buffer {
  const value = raw?.trim();
  if (!value) throw new VaultConfigError();
  const decoded = /^[A-Za-z0-9+/=_-]+$/.test(value) ? Buffer.from(value, "base64") : null;
  if (decoded && decoded.length === 32) return decoded;
  // Any other string is stretched to 32 bytes. A random 32-byte base64 value is
  // what the README asks for.
  return createHash("sha256").update(value).digest();
}

function aad(userId: string, provider: ProviderId): Buffer {
  return Buffer.from(`ohf:${userId}:${provider}`);
}

export function sealKey(plain: string, userId: string, provider: ProviderId, secret = vaultSecret()): SealedKey {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  cipher.setAAD(aad(userId, provider));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
  };
}

export function openKey(sealed: SealedKey, userId: string, provider: ProviderId, secret = vaultSecret()): string {
  const decipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(sealed.iv, "base64"));
  decipher.setAAD(aad(userId, provider));
  decipher.setAuthTag(Buffer.from(sealed.auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** What the browser is allowed to see of a saved key. */
export function maskKey(provider: ProviderId, key: string): string {
  const trimmed = key.trim();
  if (provider === "higgsfield") {
    const colon = trimmed.indexOf(":");
    if (colon > 0) {
      const id = trimmed.slice(0, colon);
      const secret = trimmed.slice(colon + 1);
      return `${id.slice(0, 4)}…:…${secret.slice(-4)}`;
    }
  }
  if (trimmed.length <= 10) return `…${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

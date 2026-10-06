export const PLATFORM_KEY_COOKIE = "api_key";

export const PLATFORM_KEY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

/** Higgsfield runs the catalog. KIE.AI covers GPT Image 2.5 and Nano Banana Pro.
 *  OpenAI and Google remain direct fallbacks when no KIE key is saved. */
export const PROVIDERS = ["higgsfield", "openai", "google", "kie"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  higgsfield: "Higgsfield",
  openai: "OpenAI",
  google: "Google AI",
  kie: "KIE.AI",
};

export type KeyMap = Partial<Record<ProviderId, string>>;

export class MissingCredentialsError extends Error {
  readonly provider: ProviderId;

  constructor(provider: ProviderId = "higgsfield") {
    super(`Missing ${PROVIDER_LABELS[provider]} key`);
    this.name = "MissingCredentialsError";
    this.provider = provider;
  }
}

export function encodeCredentials(keys: KeyMap): string {
  return JSON.stringify({ keys });
}

export function decodeCredentials(raw: string | undefined): KeyMap | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as { apiKey?: unknown; keys?: unknown };
    const keys: KeyMap = {};
    if (typeof record.apiKey === "string" && record.apiKey.trim()) {
      keys.higgsfield = requireProviderKey("higgsfield", record.apiKey);
    }
    if (record.keys !== null && typeof record.keys === "object" && !Array.isArray(record.keys)) {
      for (const provider of PROVIDERS) {
        const value = (record.keys as Record<string, unknown>)[provider];
        if (typeof value === "string" && value.trim()) {
          keys[provider] = requireProviderKey(provider, value);
        }
      }
    }
    return Object.keys(keys).length > 0 ? keys : null;
  } catch {
    return null;
  }
}

export function parseCredentialInput(data: unknown): { provider: ProviderId; apiKey: string } {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Enter an API key");
  }
  const record = data as { apiKey?: unknown; api_key?: unknown; provider?: unknown };
  const provider = parseProvider(record.provider);
  const apiKey = record.apiKey ?? record.api_key;
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("Enter an API key");
  return { provider, apiKey: requireProviderKey(provider, apiKey.trim()) };
}

export function toAuthorizationHeader(apiKey: string): string {
  return `Key ${requireProviderKey("higgsfield", apiKey)}`;
}

export function providerOfModel(provider: ProviderId | undefined): ProviderId {
  return provider ?? "higgsfield";
}

function parseProvider(value: unknown): ProviderId {
  if (value === undefined || value === "higgsfield") return "higgsfield";
  if (value === "openai" || value === "google" || value === "kie") return value;
  throw new Error("Pick a provider");
}

function requireProviderKey(provider: ProviderId, apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("Enter an API key");
  if (provider === "higgsfield") {
    const colon = trimmed.indexOf(":");
    if (colon <= 0 || colon === trimmed.length - 1) {
      throw new Error("Higgsfield key must be id:secret");
    }
  }
  if (trimmed.length > (provider === "kie" ? 800 : 400)) throw new Error("That key is too long");
  return trimmed;
}

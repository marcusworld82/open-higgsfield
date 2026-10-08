import type { ProviderId } from "./credentials";
import { toAuthorizationHeader } from "./credentials";

export type KeyCheck = { valid: boolean; message: string };

/* A request id that cannot exist. Higgsfield answers 401 for a bad key and
   404 for a good key asking about an unknown request, so the check spends no
   credits. */
const NO_SUCH_REQUEST = "00000000-0000-4000-8000-000000000000";

/** Asks each provider a free, read-only question to see whether the key works. */
export async function checkKey(
  provider: ProviderId,
  apiKey: string,
  hfBase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KeyCheck> {
  const request = keyProbe(provider, apiKey, hfBase);
  let response: Response;
  try {
    response = await fetchImpl(request.url, { headers: request.headers, cache: "no-store" });
  } catch {
    return { valid: false, message: "Could not reach the provider. Try again." };
  }
  if (response.status === 401 || response.status === 403) {
    return { valid: false, message: "The provider rejected this key." };
  }
  if (provider === "google" && response.status === 400) {
    return { valid: false, message: "Google rejected this key." };
  }
  if (provider === "higgsfield" && (response.status === 404 || response.status === 422 || response.ok)) {
    return { valid: true, message: "Higgsfield accepted this key." };
  }
  if (provider === "kie" && response.ok) {
    const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
    if (body && typeof body.code === "number" && body.code !== 200) {
      return { valid: false, message: "KIE.AI rejected this key." };
    }
  }
  if (response.ok) return { valid: true, message: "The provider accepted this key." };
  return { valid: false, message: `The provider answered ${response.status}. Try again later.` };
}

function keyProbe(provider: ProviderId, apiKey: string, hfBase: string): { url: string; headers: Record<string, string> } {
  switch (provider) {
    case "higgsfield":
      return {
        url: `${hfBase}/requests/${NO_SUCH_REQUEST}/status`,
        headers: { Authorization: toAuthorizationHeader(apiKey) },
      };
    case "openai":
      return { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${apiKey}` } };
    case "google":
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
        headers: { "x-goog-api-key": apiKey },
      };
    case "kie":
      return { url: "https://api.kie.ai/api/v1/chat/credit", headers: { Authorization: `Bearer ${apiKey}` } };
  }
}

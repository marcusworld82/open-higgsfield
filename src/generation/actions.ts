"use server";

export const maxDuration = 60;

import { cookies } from "next/headers";

import { getModel, parseSettings } from "./catalog";
import type { GenerationPlane } from "./catalog/types";
import {
  MissingCredentialsError,
  PLATFORM_KEY_COOKIE,
  PLATFORM_KEY_COOKIE_OPTIONS,
  PROVIDERS,
  type KeyMap,
  type ProviderId,
  decodeCredentials,
  encodeCredentials,
  parseCredentialInput,
  providerOfModel,
} from "./credentials";
import { createPlatformClient } from "./platform";
import type { GenerationStatus, StatusResult } from "./platform";
import { firstGenjutsuPreset, generateNanoBanana, generateOpenAIImage, kieStatus, submitKie } from "./providers";
import { toPlatform } from "./to-platform";

const DEFAULT_HF_BASE = "https://api.higgsfield.ai";

export type KeyPresence = Record<ProviderId, boolean>;

export type SubmitResult = {
  requestId: string;
  /** Set when the provider answered in this call, so the studio does not poll. */
  done?: GenerationStatus;
};

export async function savePlatformCredentials(data: unknown) {
  const { provider, apiKey } = parseCredentialInput(data);
  const current = (await readStoredCredentials()) ?? {};
  const jar = await cookies();
  jar.set(
    PLATFORM_KEY_COOKIE,
    encodeCredentials({ ...current, [provider]: apiKey }),
    PLATFORM_KEY_COOKIE_OPTIONS,
  );
}

export async function clearPlatformCredentials(data?: unknown) {
  const provider = providerFrom(data);
  const current = (await readStoredCredentials()) ?? {};
  delete current[provider];
  const jar = await cookies();
  if (Object.keys(current).length === 0) {
    jar.set(PLATFORM_KEY_COOKIE, "", { ...PLATFORM_KEY_COOKIE_OPTIONS, maxAge: 0 });
    return;
  }
  jar.set(PLATFORM_KEY_COOKIE, encodeCredentials(current), PLATFORM_KEY_COOKIE_OPTIONS);
}

export async function hasPlatformCredentials(): Promise<KeyPresence> {
  const stored = await readStoredCredentials();
  return {
    higgsfield: Boolean(stored?.higgsfield),
    openai: Boolean(stored?.openai),
    google: Boolean(stored?.google),
    kie: Boolean(stored?.kie),
  };
}

export async function submitGeneration(plane: GenerationPlane): Promise<SubmitResult> {
  const model = getModel(plane.model);
  const parsed: GenerationPlane = {
    ...plane,
    settings: parseSettings(model, plane.settings),
  };
  const provider = providerOfModel(model.provider);
  const stored = (await readStoredCredentials()) ?? {};
  if ((provider === "openai" || provider === "google") && stored.kie) {
    const taskId = await submitKie(stored.kie, parsed);
    return { requestId: `kie:${taskId}` };
  }
  const keys = await readCredentials(provider);

  if (provider === "openai") {
    const done = await generateOpenAIImage(keys.openai!, parsed);
    const requestId = `openai-${crypto.randomUUID()}`;
    return { requestId, done: { ...done, requestId } };
  }
  if (provider === "google") {
    const done = await generateNanoBanana(keys.google!, parsed);
    const requestId = `google-${crypto.randomUUID()}`;
    return { requestId, done: { ...done, requestId } };
  }

  if (parsed.model === "genjutsu" && parsed.settings.mode === "restyle") {
    parsed.settings.presetId = await firstGenjutsuPreset(keys.baseUrl, keys.higgsfield!);
  }
  const { path, body } = toPlatform(parsed);
  const queued = await createPlatformClient({
    apiKey: keys.higgsfield!,
    baseUrl: keys.baseUrl,
  }).submit(path, body);
  return { requestId: queued.requestId };
}

export async function getGenerationStatuses(data: unknown): Promise<StatusResult[]> {
  const requestIds = parseRequestIds(data);
  const kieIds = requestIds.filter((requestId) => requestId.startsWith("kie:"));
  const platformIds = requestIds.filter((requestId) => !requestId.startsWith("kie:"));
  const results: StatusResult[] = [];

  if (kieIds.length > 0) {
    const keys = await readCredentials("kie");
    results.push(
      ...(await Promise.all(
        kieIds.map(async (requestId): Promise<StatusResult> => {
          try {
            return { requestId, status: await kieStatus(keys.kie!, requestId.slice(4)) };
          } catch (caught) {
            return { requestId, error: caught instanceof Error ? caught.message : String(caught) };
          }
        }),
      )),
    );
  }

  if (platformIds.length > 0) {
    const keys = await readCredentials("higgsfield");
    const client = createPlatformClient({ apiKey: keys.higgsfield!, baseUrl: keys.baseUrl });
    results.push(
      ...(await Promise.all(
        platformIds.map(async (requestId): Promise<StatusResult> => {
          try {
            return { requestId, status: await client.status(requestId) };
          } catch (caught) {
            return { requestId, error: caught instanceof Error ? caught.message : String(caught) };
          }
        }),
      )),
    );
  }

  return results;
}

async function readStoredCredentials(): Promise<KeyMap | null> {
  const jar = await cookies();
  return decodeCredentials(jar.get(PLATFORM_KEY_COOKIE)?.value);
}

async function readCredentials(provider: ProviderId): Promise<KeyMap & { baseUrl: string }> {
  const stored = await readStoredCredentials();
  if (!stored?.[provider]) throw new MissingCredentialsError(provider);
  return {
    ...stored,
    baseUrl: process.env.HF_API_BASE_URL?.replace(/\/$/, "") || DEFAULT_HF_BASE,
  };
}

function providerFrom(data: unknown): ProviderId {
  if (data === undefined || data === null) return "higgsfield";
  if (typeof data === "string" && PROVIDERS.includes(data as ProviderId)) return data as ProviderId;
  if (typeof data === "object" && !Array.isArray(data)) {
    const provider = (data as { provider?: unknown }).provider;
    if (typeof provider === "string" && PROVIDERS.includes(provider as ProviderId)) {
      return provider as ProviderId;
    }
  }
  return "higgsfield";
}

function parseRequestIds(data: unknown): string[] {
  const payload = asObject(data, "Invalid status payload");
  const requestIds = payload.requestIds;
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    throw new Error("Invalid request ids");
  }
  return requestIds.map((requestId) => {
    if (typeof requestId !== "string" || !requestId) throw new Error("Invalid request id");
    return requestId;
  });
}

function asObject(data: unknown, message: string): Record<string, unknown> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error(message);
  return data as Record<string, unknown>;
}

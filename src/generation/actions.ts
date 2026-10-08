"use server";

import { getModel, parseSettings } from "./catalog";
import type { GenerationPlane } from "./catalog/types";
import {
  MissingCredentialsError,
  PROVIDERS,
  PROVIDER_LABELS,
  type ProviderId,
  parseCredentialInput,
  providerOfModel,
} from "./credentials";
import { toFailure } from "./failure";
import { checkKey, type KeyCheck } from "./key-check";
import { deleteKey, listKeySummaries, readKey, readKeys, saveKey, type KeySummaries, type KeySummary } from "./key-store";
import { createPlatformClient } from "./platform";
import type { GenerationStatus, StatusResult } from "./platform";
import { firstGenjutsuPreset, generateNanoBanana, generateOpenAIImage, kieStatus, submitKie } from "./providers";
import type { ActionResult } from "./result";
import { toPlatform } from "./to-platform";

/* Server actions run inside the page route; its maxDuration is set in
   src/app/page.tsx because a "use server" file may only export async
   functions. */

const DEFAULT_HF_BASE = "https://api.higgsfield.ai";

function hfBase(): string {
  return process.env.HF_API_BASE_URL?.trim().replace(/\/$/, "") || DEFAULT_HF_BASE;
}

export type SubmitResult = {
  requestId: string;
  /** Set when the provider answered in this call, so the studio does not poll. */
  done?: GenerationStatus;
};

/* ---------- keys ---------- */

export async function listProviderKeys(): Promise<ActionResult<KeySummaries>> {
  try {
    return { ok: true, value: await listKeySummaries() };
  } catch (caught) {
    return toFailure(caught, "keys");
  }
}

export async function saveProviderKey(data: unknown): Promise<ActionResult<KeySummary>> {
  try {
    const { provider, apiKey } = parseCredentialInput(data);
    return { ok: true, value: await saveKey(provider, apiKey) };
  } catch (caught) {
    return toFailure(caught, "keys");
  }
}

export async function deleteProviderKey(data: unknown): Promise<ActionResult<null>> {
  try {
    await deleteKey(providerFrom(data));
    return { ok: true, value: null };
  } catch (caught) {
    return toFailure(caught, "keys");
  }
}

/** Tests the saved key for one provider with a free read-only request. */
export async function checkProviderKey(data: unknown): Promise<ActionResult<KeyCheck>> {
  try {
    const provider = providerFrom(data);
    const key = await readKey(provider);
    return { ok: true, value: await checkKey(provider, key, hfBase()) };
  } catch (caught) {
    return toFailure(caught, "keys");
  }
}

/* ---------- generation ---------- */

export async function submitGeneration(plane: GenerationPlane): Promise<ActionResult<SubmitResult>> {
  try {
    return { ok: true, value: await submit(plane) };
  } catch (caught) {
    return toFailure(caught, "submit");
  }
}

async function submit(plane: GenerationPlane): Promise<SubmitResult> {
  const model = getModel(plane.model);
  const parsed: GenerationPlane = {
    ...plane,
    settings: parseSettings(model, plane.settings),
  };
  const provider = providerOfModel(model.provider);
  const stored = await readKeys();

  if ((provider === "openai" || provider === "google") && stored.kie) {
    const taskId = await submitKie(stored.kie, parsed);
    return { requestId: `kie:${taskId}` };
  }
  const key = stored[provider];
  if (!key) throw new MissingCredentialsError(provider);

  if (provider === "openai") {
    const done = await generateOpenAIImage(key, parsed);
    const requestId = `openai-${crypto.randomUUID()}`;
    return { requestId, done: { ...done, requestId } };
  }
  if (provider === "google") {
    const done = await generateNanoBanana(key, parsed);
    const requestId = `google-${crypto.randomUUID()}`;
    return { requestId, done: { ...done, requestId } };
  }

  if (parsed.model === "genjutsu" && parsed.settings.mode === "restyle") {
    parsed.settings.presetId = await firstGenjutsuPreset(hfBase(), key);
  }
  const { path, body } = toPlatform(parsed);
  const queued = await createPlatformClient({ apiKey: key, baseUrl: hfBase() }).submit(path, body);
  return { requestId: queued.requestId };
}

export async function getGenerationStatuses(data: unknown): Promise<ActionResult<StatusResult[]>> {
  try {
    return { ok: true, value: await statuses(parseRequestIds(data)) };
  } catch (caught) {
    return toFailure(caught, "status");
  }
}

async function statuses(requestIds: string[]): Promise<StatusResult[]> {
  const kieIds = requestIds.filter((requestId) => requestId.startsWith("kie:"));
  const platformIds = requestIds.filter((requestId) => !requestId.startsWith("kie:"));
  const results: StatusResult[] = [];
  const keys = await readKeys();

  const missing = (provider: ProviderId, ids: string[]) => {
    const error = `Add your ${PROVIDER_LABELS[provider]} key to check this run`;
    for (const requestId of ids) results.push({ requestId, error });
  };

  if (kieIds.length > 0) {
    if (!keys.kie) missing("kie", kieIds);
    else
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
    if (!keys.higgsfield) missing("higgsfield", platformIds);
    else {
      const client = createPlatformClient({ apiKey: keys.higgsfield, baseUrl: hfBase() });
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
  }

  return results;
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
  throw new Error("Pick a provider");
}

function parseRequestIds(data: unknown): string[] {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid status payload");
  const requestIds = (data as Record<string, unknown>).requestIds;
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    throw new Error("Invalid request ids");
  }
  return requestIds.map((requestId) => {
    if (typeof requestId !== "string" || !requestId) throw new Error("Invalid request id");
    return requestId;
  });
}

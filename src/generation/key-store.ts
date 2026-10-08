import { cookies } from "next/headers";

import { ownerFrom, readAuth } from "@/lib/supabase/server";

import {
  MissingCredentialsError,
  PLATFORM_KEY_COOKIE,
  PLATFORM_KEY_COOKIE_OPTIONS,
  PROVIDERS,
  type KeyMap,
  type ProviderId,
  decodeCredentials,
  encodeCredentials,
} from "./credentials";
import { maskKey, openKey, sealKey } from "./key-vault";

/** Server-only. One place that knows where provider keys live: in Supabase,
    sealed and per user, when Supabase is configured; otherwise in the original
    httpOnly cookie. Nothing here returns a full key to a caller that could pass
    it to the browser — only the generation actions use readKeys(). */

export type KeySummary = { hint: string; updatedAt: string | null };
export type KeySummaries = Record<ProviderId, KeySummary | null>;

type KeyRow = {
  provider: ProviderId;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  hint: string;
  updated_at: string;
};

const TABLE = "ohf_api_keys";

function emptySummaries(): KeySummaries {
  return { higgsfield: null, openai: null, google: null, kie: null };
}

async function readCookieKeys(): Promise<KeyMap> {
  const jar = await cookies();
  return decodeCredentials(jar.get(PLATFORM_KEY_COOKIE)?.value) ?? {};
}

async function writeCookieKeys(keys: KeyMap): Promise<void> {
  const jar = await cookies();
  if (Object.keys(keys).length === 0) {
    jar.set(PLATFORM_KEY_COOKIE, "", { ...PLATFORM_KEY_COOKIE_OPTIONS, maxAge: 0 });
    return;
  }
  jar.set(PLATFORM_KEY_COOKIE, encodeCredentials(keys), PLATFORM_KEY_COOKIE_OPTIONS);
}

/** Every saved key, opened. For the server's own outbound calls only. */
export async function readKeys(): Promise<KeyMap> {
  const auth = await readAuth();
  if (!auth.configured) return readCookieKeys();
  const { supabase, user } = ownerFrom(auth);
  const { data, error } = await supabase
    .from(TABLE)
    .select("provider, ciphertext, iv, auth_tag, hint, updated_at")
    .eq("user_id", user.id);
  if (error) throw new Error(`Could not read saved keys (${error.message})`);
  const keys: KeyMap = {};
  for (const row of (data ?? []) as KeyRow[]) {
    if (!PROVIDERS.includes(row.provider)) continue;
    try {
      keys[row.provider] = openKey(row, user.id, row.provider);
    } catch {
      // Sealed under a different secret. The key has to be entered again.
      console.error("[keys] could not open saved key", { provider: row.provider });
    }
  }
  return keys;
}

export async function readKey(provider: ProviderId): Promise<string> {
  const keys = await readKeys();
  const key = keys[provider];
  if (!key) throw new MissingCredentialsError(provider);
  return key;
}

export async function saveKey(provider: ProviderId, apiKey: string): Promise<KeySummary> {
  const auth = await readAuth();
  if (!auth.configured) {
    await writeCookieKeys({ ...(await readCookieKeys()), [provider]: apiKey });
    return { hint: maskKey(provider, apiKey), updatedAt: new Date().toISOString() };
  }
  const { supabase, user } = ownerFrom(auth);
  const sealed = sealKey(apiKey, user.id, provider);
  const hint = maskKey(provider, apiKey);
  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ user_id: user.id, provider, hint, ...sealed }, { onConflict: "user_id,provider" })
    .select("updated_at")
    .single();
  if (error) throw new Error(`Could not save the key (${error.message})`);
  return { hint, updatedAt: (data as { updated_at: string }).updated_at };
}

export async function deleteKey(provider: ProviderId): Promise<void> {
  const auth = await readAuth();
  if (!auth.configured) {
    const current = await readCookieKeys();
    delete current[provider];
    await writeCookieKeys(current);
    return;
  }
  const { supabase, user } = ownerFrom(auth);
  const { error } = await supabase.from(TABLE).delete().eq("user_id", user.id).eq("provider", provider);
  if (error) throw new Error(`Could not delete the key (${error.message})`);
}

/** Masked hints for the key panel. When a signed-in owner still has keys in
    the old cookie, they are moved into Supabase here and the cookie is
    cleared, so a key typed before sign-in existed is not lost. */
export async function listKeySummaries(): Promise<KeySummaries> {
  const summaries = emptySummaries();
  const auth = await readAuth();
  if (!auth.configured) {
    const keys = await readCookieKeys();
    for (const provider of PROVIDERS) {
      const key = keys[provider];
      if (key) summaries[provider] = { hint: maskKey(provider, key), updatedAt: null };
    }
    return summaries;
  }
  const { supabase, user } = ownerFrom(auth);
  const { data, error } = await supabase
    .from(TABLE)
    .select("provider, hint, updated_at")
    .eq("user_id", user.id);
  if (error) throw new Error(`Could not read saved keys (${error.message})`);
  for (const row of (data ?? []) as Pick<KeyRow, "provider" | "hint" | "updated_at">[]) {
    if (PROVIDERS.includes(row.provider)) {
      summaries[row.provider] = { hint: row.hint, updatedAt: row.updated_at };
    }
  }

  const legacy = await readCookieKeys();
  const moved = Object.entries(legacy) as Array<[ProviderId, string]>;
  if (moved.length > 0) {
    for (const [provider, key] of moved) {
      if (!summaries[provider]) summaries[provider] = await saveKey(provider, key);
    }
    await writeCookieKeys({});
  }
  return summaries;
}

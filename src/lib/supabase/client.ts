"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseEnv } from "./config";

let client: SupabaseClient | null | undefined;

/** The browser's Supabase client, sharing the session cookies the server reads.
    It does not read sessions out of the URL by itself; the password page does
    that on purpose, so a recovery link is handled in one place. */
export function supabaseBrowser(): SupabaseClient | null {
  if (client === undefined) {
    const env = supabaseEnv();
    client = env ? createBrowserClient(env.url, env.key, { auth: { detectSessionInUrl: false } }) : null;
  }
  return client;
}

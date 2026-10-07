import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { supabaseEnv } from "./config";

/** A Supabase client acting as the signed-in visitor, with their session read
    from (and refreshed into) the request cookies. Null when Supabase is not
    configured. */
export async function createSupabaseServer(): Promise<SupabaseClient | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const jar = await cookies();
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          /* Called from a server component render, where cookies are read-only.
             The proxy refreshes the session on the next request instead. */
        }
      },
    },
  });
}

export type AuthState =
  | { configured: false }
  | { configured: true; supabase: SupabaseClient; user: null; owner: false }
  | { configured: true; supabase: SupabaseClient; user: User; owner: boolean };

export async function readAuth(): Promise<AuthState> {
  const supabase = await createSupabaseServer();
  if (!supabase) return { configured: false };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { configured: true, supabase, user: null, owner: false };
  const { data: owner } = await supabase.rpc("ohf_is_owner");
  return { configured: true, supabase, user: data.user, owner: owner === true };
}

export class AuthRequiredError extends Error {
  constructor(message = "Sign in to use the studio") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/** The signed-in owner, or an error the studio turns into the sign-in screen. */
export async function requireOwner(): Promise<{ supabase: SupabaseClient; user: User }> {
  return ownerFrom(await readAuth());
}

export function ownerFrom(auth: AuthState): { supabase: SupabaseClient; user: User } {
  if (!auth.configured) throw new Error("Supabase is not configured");
  if (!auth.user) throw new AuthRequiredError();
  if (!auth.owner) throw new AuthRequiredError("This account is not allowed to use the studio");
  return { supabase: auth.supabase, user: auth.user };
}

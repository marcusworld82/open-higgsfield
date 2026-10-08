"use server";

import { createSupabaseServer, readAuth } from "@/lib/supabase/server";

export type SessionState =
  | { configured: false }
  | { configured: true; email: string | null; owner: boolean };

/** Who is signed in, without anything secret. */
export async function getSessionState(): Promise<SessionState> {
  const auth = await readAuth();
  if (!auth.configured) return { configured: false };
  return { configured: true, email: auth.user?.email ?? null, owner: auth.owner };
}

export type SignInResult = { ok: true; session: SessionState } | { ok: false; error: string };

export async function signIn(data: unknown): Promise<SignInResult> {
  const record = data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (!email || !password) return { ok: false, error: "Enter your email and password." };

  const supabase = await createSupabaseServer();
  if (!supabase) return { ok: false, error: "Sign-in is not set up on this server." };
  const { data: signedIn, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !signedIn.user) {
    return {
      ok: false,
      error: !error || /invalid login/i.test(error.message) ? "That email and password do not match." : error.message,
    };
  }
  // The same client now carries the new session, so the owner check runs as this user.
  const { data: owner } = await supabase.rpc("ohf_is_owner");
  if (owner !== true) {
    await supabase.auth.signOut();
    return { ok: false, error: "This account is not on the list for this studio." };
  }
  return { ok: true, session: { configured: true, email: signedIn.user.email ?? email, owner: true } };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServer();
  await supabase?.auth.signOut();
}

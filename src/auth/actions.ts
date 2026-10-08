"use server";

import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { supabaseEnv } from "@/lib/supabase/config";
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

export type ResetRequestResult = { ok: true } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails a link that opens /reset-password on this site, where the person
    picks a new password. The same link sets a first password for an account
    that was created without one. Supabase answers the same way whether or not
    the email has an account, so this never tells a stranger who is signed up. */
export async function requestPasswordReset(data: unknown): Promise<ResetRequestResult> {
  const record = data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) return { ok: false, error: "Enter the email you sign in with." };

  const env = supabaseEnv();
  if (!env) return { ok: false, error: "Sign-in is not set up on this server." };

  // No PKCE here: the link must work on any device, not only the browser that
  // asked for it, so Supabase returns the session in the link itself.
  const supabase = createClient(env.url, env.key, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/reset-password`,
  });
  if (error) {
    if (error.status === 429 || /rate limit|too many/i.test(error.message)) {
      return { ok: false, error: "Too many emails were sent in the last hour. Try again later." };
    }
    console.error("[auth] password reset email failed:", error.status, error.message);
    return { ok: false, error: "The email could not be sent. Try again later." };
  }
  return { ok: true };
}

/** The address this request came in on. OHF_SITE_URL wins when it is set.
    Supabase only follows links to addresses on its redirect allowlist, so a
    forged Host header cannot send the link somewhere else. */
async function siteOrigin(): Promise<string> {
  const fixed = process.env.OHF_SITE_URL?.trim().replace(/\/$/, "");
  if (fixed) return fixed;
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

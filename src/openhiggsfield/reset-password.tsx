"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";

import { getSessionState } from "@/auth/actions";
import { supabaseBrowser } from "@/lib/supabase/client";

import { GRAIN_URI } from "./artwork";
import { ForgotPassword } from "./sign-in";

type Stage =
  | { kind: "checking" }
  | { kind: "form"; email: string | null }
  | { kind: "saved"; owner: boolean }
  | { kind: "no-link"; message: string | null };

const MIN_LENGTH = 8;

/** Opened from the email link (or from "Change password" while signed in).
    Supabase puts a short-lived session in the link; once it is in, the person
    picks a password and lands in the studio already signed in. */
export function ResetPassword({ fontClassName = "" }: { fontClassName?: string }) {
  const [stage, setStage] = useState<Stage>({ kind: "checking" });

  useEffect(() => {
    let live = true;
    const read = async () => {
      const next = await readLink();
      if (live) setStage(next);
    };
    void read();
    // A link opened while this page is already showing only changes the hash.
    const onHash = () => {
      if (window.location.hash.length > 1) {
        setStage({ kind: "checking" });
        void read();
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      live = false;
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  return (
    <div className={`ohf ${fontClassName}`} style={{ "--ohf-grain": GRAIN_URI } as React.CSSProperties}>
      <div className="ohf-signin">
        {stage.kind === "checking" && (
          <div className="ohf-dialog-panel ohf-signin-panel" role="status">
            <p className="ohf-keys-copy">Checking your link…</p>
          </div>
        )}
        {stage.kind === "form" && <PasswordForm email={stage.email} onSaved={(owner) => setStage({ kind: "saved", owner })} />}
        {stage.kind === "saved" && (
          <div className="ohf-dialog-panel ohf-signin-panel" role="status">
            <div className="ohf-signin-head">
              <h1 className="ohf-keys-title">Password saved</h1>
              <p className="ohf-keys-copy">
                {stage.owner
                  ? "You are signed in. Use this email and password next time."
                  : "Your password is set, but this account is not on the list for this studio yet."}
              </p>
            </div>
            {stage.owner && (
              <Link className="ohf-keys-save ohf-signin-submit ohf-signin-link-btn" href="/">
                Open the studio
              </Link>
            )}
          </div>
        )}
        {stage.kind === "no-link" && (
          <ForgotPassword
            title="Get a new link"
            intro={
              stage.message ??
              "This page needs the link from your email. Links work once and expire after an hour. Enter your email to get a new one."
            }
            backHref="/"
          />
        )}
      </div>
    </div>
  );
}

function PasswordForm({ email, onSaved }: { email: string | null; onSaved: (owner: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError("The two passwords do not match.");
    const supabase = supabaseBrowser();
    if (!supabase) return setError("Sign-in is not set up on this site.");
    setBusy(true);
    setError(null);
    try {
      const { error: failed } = await supabase.auth.updateUser({ password });
      if (failed) {
        setError(
          failed.code === "same_password"
            ? "That is already your password. Pick a different one, or just sign in."
            : failed.code === "weak_password"
              ? "That password is too easy to guess. Try a longer one."
              : failed.message,
        );
        return;
      }
      const session = await getSessionState().catch(() => null);
      onSaved(session?.configured === true && session.owner);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ohf-dialog-panel ohf-signin-panel" onSubmit={(event) => void onSubmit(event)}>
      <div className="ohf-signin-head">
        <h1 className="ohf-keys-title">Set your password</h1>
        <p className="ohf-keys-copy">
          {email ? `For ${email}. ` : ""}At least {MIN_LENGTH} characters. You will use it with your email to sign in.
        </p>
      </div>
      {email && <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />}
      <label className="ohf-field">
        <span className="ohf-field-label">New password</span>
        <input
          className="ohf-input"
          type="password"
          name="new-password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className="ohf-field">
        <span className="ohf-field-label">Type it again</span>
        <input
          className="ohf-input"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </label>
      {error && (
        <div className="ohf-alert" role="alert">
          <span className="ohf-alert-text">{error}</span>
        </div>
      )}
      <button type="submit" className="ohf-keys-save ohf-signin-submit" disabled={busy}>
        {busy ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

/** Reads whatever the email link carried and turns it into a session.
    Supabase can send the session in the hash (#access_token=…), a one-time
    code (?code=…), or a token hash (?token_hash=…&type=…), depending on how
    the email template is written. All three are handled. */
async function readLink(): Promise<Stage> {
  const supabase = supabaseBrowser();
  if (!supabase) return { kind: "no-link", message: "Sign-in is not set up on this site." };

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const clean = () => window.history.replaceState(null, "", window.location.pathname);

  const linkError = hash.get("error_description") ?? query.get("error_description");
  if (linkError) {
    clean();
    const expired = (hash.get("error_code") ?? query.get("error_code")) === "otp_expired";
    return {
      kind: "no-link",
      message: expired
        ? "That link has expired or was already used. Enter your email to get a new one."
        : `That link did not work (${linkError}). Enter your email to get a new one.`,
    };
  }

  let failed = false;
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const code = query.get("code");
  const tokenHash = query.get("token_hash");
  if (accessToken && refreshToken) {
    failed = !!(await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })).error;
  } else if (code) {
    failed = !!(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash) {
    const type = (query.get("type") ?? "recovery") as EmailOtpType;
    failed = !!(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }
  if (accessToken || code || tokenHash) clean();
  if (failed) {
    return { kind: "no-link", message: "That link has expired or was already used. Enter your email to get a new one." };
  }

  const { data } = await supabase.auth.getUser();
  if (data.user) return { kind: "form", email: data.user.email ?? null };
  return { kind: "no-link", message: null };
}

"use client";

import { useState, type FormEvent } from "react";

import { signIn, type SessionState } from "@/auth/actions";

/** The studio is private when Supabase is set up: one email and password,
    the same login Prompt Bank uses. There is no sign-up here on purpose. */
export function SignIn({ onSignedIn }: { onSignedIn: (session: SessionState) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn({ email, password });
      if (result.ok) onSignedIn(result.session);
      else setError(result.error);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ohf-signin">
      <form className="ohf-dialog-panel ohf-signin-panel" onSubmit={(event) => void onSubmit(event)}>
        <div className="ohf-signin-head">
          <h1 className="ohf-keys-title">Sign in to your studio</h1>
          <p className="ohf-keys-copy">
            Your Higgsfield and other API keys are saved to your account, so you only enter them once.
          </p>
        </div>
        <label className="ohf-field">
          <span className="ohf-field-label">Email</span>
          <input
            className="ohf-input"
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="ohf-field">
          <span className="ohf-field-label">Password</span>
          <input
            className="ohf-input"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <div className="ohf-alert" role="alert">
            <span className="ohf-alert-text">{error}</span>
          </div>
        )}
        <button type="submit" className="ohf-keys-save ohf-signin-submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="ohf-signin-note">Same email and password as Prompt Bank.</p>
      </form>
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";

import { requestPasswordReset, signIn, type SessionState } from "@/auth/actions";

/** The studio is private when Supabase is set up: one email and password per
    person. There is no sign-up here on purpose. */
export function SignIn({ onSignedIn }: { onSignedIn: (session: SessionState) => void }) {
  const [mode, setMode] = useState<"sign-in" | "forgot">("sign-in");
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

  if (mode === "forgot") {
    return (
      <div className="ohf-signin">
        <ForgotPassword
          title="Set or reset your password"
          intro="Enter the email you sign in with. We will send a link to pick a new password. Use this the first time too."
          initialEmail={email}
          onBack={() => setMode("sign-in")}
        />
      </div>
    );
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
        <button type="button" className="ohf-signin-alt" onClick={() => setMode("forgot")}>
          Forgot your password, or first time here?
        </button>
      </form>
    </div>
  );
}

/** Asks for the email and sends the set-password link. Used on the sign-in
    screen and on /reset-password when a link is missing or expired. */
export function ForgotPassword({
  title,
  intro,
  initialEmail = "",
  onBack,
  backHref,
}: {
  title: string;
  intro: string;
  initialEmail?: string;
  onBack?: () => void;
  backHref?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await requestPasswordReset({ email });
      if (result.ok) setSentTo(email.trim());
      else setError(result.error);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const back = onBack ? (
    <button type="button" className="ohf-signin-alt" onClick={onBack}>
      Back to sign in
    </button>
  ) : backHref ? (
    <a className="ohf-signin-alt" href={backHref}>
      Back to sign in
    </a>
  ) : null;

  if (sentTo) {
    return (
      <div className="ohf-dialog-panel ohf-signin-panel ohf-signin-sent" role="status">
        <div className="ohf-signin-head">
          <h1 className="ohf-keys-title">Check your email</h1>
          <p className="ohf-keys-copy">
            If {sentTo} has an account here, a link is on its way. Open it on this phone or computer and pick your
            password. The link works once and expires in an hour. Check spam if it is not there in a few minutes.
          </p>
        </div>
        {back}
      </div>
    );
  }

  return (
    <form className="ohf-dialog-panel ohf-signin-panel ohf-forgot-panel" onSubmit={(event) => void onSubmit(event)}>
      <div className="ohf-signin-head">
        <h1 className="ohf-keys-title">{title}</h1>
        <p className="ohf-keys-copy">{intro}</p>
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
      {error && (
        <div className="ohf-alert" role="alert">
          <span className="ohf-alert-text">{error}</span>
        </div>
      )}
      <button type="submit" className="ohf-keys-save ohf-signin-submit" disabled={busy}>
        {busy ? "Sending…" : "Email me a link"}
      </button>
      {back}
    </form>
  );
}

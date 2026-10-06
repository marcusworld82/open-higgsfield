"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  PROVIDER_LABELS,
  PROVIDERS,
  type ProviderId,
} from "@/generation/credentials";
import { clearPlatformCredentials, savePlatformCredentials, type KeyPresence } from "@/generation/actions";

import { CloseIcon } from "./icons";

const HINTS: Record<ProviderId, string> = {
  higgsfield: "Paste the Higgsfield key as id:secret. It runs the catalog, including Genjutsu.",
  openai: "Paste an OpenAI API key. Used for GPT Image 2.5 only when no KIE.AI key is saved.",
  google: "Paste a Google AI Studio key. Used for Nano Banana Pro only when no KIE.AI key is saved.",
  kie: "Paste a KIE.AI key from kie.ai/api-key. GPT Image 2.5 and Nano Banana Pro use this key.",
};

export function KeyModal({
  presence,
  initialProvider,
  onClose,
  onChange,
}: {
  presence: KeyPresence;
  initialProvider: ProviderId;
  onClose: () => void;
  onChange: (presence: KeyPresence) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [provider, setProvider] = useState<ProviderId>(initialProvider);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    panelRef.current?.focus();
  }, []);

  const configured = presence[provider];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await savePlatformCredentials({ provider, api_key: apiKey });
      const next = { ...presence, [provider]: true };
      onChange(next);
      setApiKey("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the key");
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setBusy(true);
    setError(null);
    try {
      await clearPlatformCredentials({ provider });
      onChange({ ...presence, [provider]: false });
      setApiKey("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="ohf-keys-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div ref={panelRef} tabIndex={-1} className="ohf-dialog-panel ohf-keys-panel">
        <div className="ohf-keys-head">
          <div>
            <div id="ohf-keys-title" className="ohf-keys-title">
              API keys
            </div>
            <p className="ohf-keys-copy">{HINTS[provider]} Keys stay in an httpOnly cookie.</p>
          </div>
          <button type="button" className="ohf-icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon size={13} />
          </button>
        </div>

        <form className="ohf-keys-form" onSubmit={(event) => void onSubmit(event)}>
          <label className="ohf-field">
            <div className="ohf-field-label">Provider</div>
            <select
              className="ohf-input"
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value as ProviderId);
                setApiKey("");
                setError(null);
              }}
            >
              {PROVIDERS.map((id) => (
                <option key={id} value={id}>
                  {PROVIDER_LABELS[id]}
                  {presence[id] ? " · connected" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="ohf-field">
            <div className="ohf-field-label">
              {configured ? `Replace ${PROVIDER_LABELS[provider]} key` : `${PROVIDER_LABELS[provider]} key`}
            </div>
            <input
              className="ohf-input ohf-input--mono"
              name="api_key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={provider === "higgsfield" ? "id:secret" : "Paste key"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>

          {error && (
            <div className="ohf-alert" role="alert">
              <span className="ohf-alert-text">{error}</span>
            </div>
          )}

          <div className="ohf-keys-actions">
            {configured && (
              <button type="button" className="ohf-btn-quiet" disabled={busy} onClick={() => void onClear()}>
                Remove key
              </button>
            )}
            <button type="submit" className="ohf-keys-save" disabled={busy || !apiKey.trim()}>
              {busy ? "Saving…" : configured ? "Replace key" : "Save key"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

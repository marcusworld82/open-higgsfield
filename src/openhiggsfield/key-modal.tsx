"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { checkProviderKey, deleteProviderKey, saveProviderKey } from "@/generation/actions";
import { PROVIDER_LABELS, PROVIDERS, type ProviderId } from "@/generation/credentials";
import type { KeySummaries } from "@/generation/key-store";
import { unwrap } from "@/generation/result";

import { CloseIcon } from "./icons";

const HINTS: Record<ProviderId, string> = {
  higgsfield: "Paste it as id:secret. Runs every model in the catalog, including Genjutsu.",
  openai: "Used for GPT Image 2.5 only when no KIE.AI key is saved.",
  google: "A Google AI Studio key. Used for Nano Banana Pro only when no KIE.AI key is saved.",
  kie: "From kie.ai/api-key. Runs GPT Image 2.5 and Nano Banana Pro.",
};

type RowNote = { tone: "ok" | "bad" | "info"; text: string };

export function KeyModal({
  summaries,
  initialProvider,
  account,
  onClose,
  onChange,
  onSignOut,
}: {
  summaries: KeySummaries;
  initialProvider: ProviderId;
  /* Signed-in email when keys are saved to an account; null when they live in
     this browser's cookie because Supabase is not set up. */
  account: string | null;
  onClose: () => void;
  onChange: (next: KeySummaries) => void;
  onSignOut?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<ProviderId | null>(summaries[initialProvider] ? null : initialProvider);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProviderId | null>(null);
  const [notes, setNotes] = useState<Partial<Record<ProviderId, RowNote>>>({});

  useEffect(() => {
    ref.current?.showModal();
    panelRef.current?.focus();
  }, []);

  const note = (provider: ProviderId, value: RowNote | null) =>
    setNotes((prev) => {
      const next = { ...prev };
      if (value) next[provider] = value;
      else delete next[provider];
      return next;
    });

  async function onSave(event: FormEvent, provider: ProviderId) {
    event.preventDefault();
    setBusy(provider);
    note(provider, null);
    try {
      const summary = unwrap(await saveProviderKey({ provider, api_key: apiKey }));
      onChange({ ...summaries, [provider]: summary });
      setApiKey("");
      setEditing(null);
      // A free read-only call tells Marcus right away whether the key works.
      const check = unwrap(await checkProviderKey({ provider }));
      note(provider, { tone: check.valid ? "ok" : "bad", text: `Saved. ${check.message}` });
    } catch (caught) {
      note(provider, { tone: "bad", text: caught instanceof Error ? caught.message : "Could not save the key" });
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(provider: ProviderId) {
    setBusy(provider);
    note(provider, null);
    try {
      unwrap(await deleteProviderKey({ provider }));
      onChange({ ...summaries, [provider]: null });
      setConfirmDelete(null);
      note(provider, { tone: "info", text: "Key deleted." });
    } catch (caught) {
      note(provider, { tone: "bad", text: caught instanceof Error ? caught.message : "Could not delete the key" });
    } finally {
      setBusy(null);
    }
  }

  async function onCheck(provider: ProviderId) {
    setBusy(provider);
    note(provider, { tone: "info", text: "Checking…" });
    try {
      const check = unwrap(await checkProviderKey({ provider }));
      note(provider, { tone: check.valid ? "ok" : "bad", text: check.message });
    } catch (caught) {
      note(provider, { tone: "bad", text: caught instanceof Error ? caught.message : "Could not check the key" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <dialog
      ref={ref}
      className="ohf-sheet-dialog"
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
            <p className="ohf-keys-copy">
              {account
                ? "Saved to your account, encrypted. Only the first and last few characters are ever shown."
                : "Saved in this browser only, in an httpOnly cookie."}
            </p>
          </div>
          <button type="button" className="ohf-icon-btn ohf-sheet-close" aria-label="Close" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </div>

        <ul className="ohf-keys-list">
          {PROVIDERS.map((provider) => {
            const saved = summaries[provider];
            const open = editing === provider;
            const rowBusy = busy === provider;
            const rowNote = notes[provider];
            return (
              <li key={provider} className="ohf-key-row" data-provider={provider}>
                <div className="ohf-key-row-main">
                  <div className="ohf-key-row-text">
                    <span className="ohf-key-row-name">{PROVIDER_LABELS[provider]}</span>
                    <span className="ohf-key-row-state" data-saved={Boolean(saved)}>
                      {saved ? <code className="ohf-key-hint">{saved.hint}</code> : "Not saved"}
                    </span>
                  </div>
                  {!open && (
                    <div className="ohf-key-row-acts">
                      {saved && confirmDelete !== provider && (
                        <>
                          <button
                            type="button"
                            className="ohf-btn-quiet"
                            disabled={rowBusy}
                            onClick={() => void onCheck(provider)}
                          >
                            Check
                          </button>
                          <button
                            type="button"
                            className="ohf-btn-quiet"
                            disabled={rowBusy}
                            onClick={() => setConfirmDelete(provider)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {saved && confirmDelete === provider && (
                        <>
                          <button type="button" className="ohf-btn-quiet" onClick={() => setConfirmDelete(null)}>
                            Keep
                          </button>
                          <button
                            type="button"
                            className="ohf-btn-danger"
                            disabled={rowBusy}
                            onClick={() => void onDelete(provider)}
                          >
                            {rowBusy ? "Deleting…" : "Delete key"}
                          </button>
                        </>
                      )}
                      {confirmDelete !== provider && (
                        <button
                          type="button"
                          className="ohf-btn-solid"
                          disabled={rowBusy}
                          onClick={() => {
                            setEditing(provider);
                            setApiKey("");
                            setConfirmDelete(null);
                            note(provider, null);
                          }}
                        >
                          {saved ? "Replace" : "Add"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {open && (
                  <form className="ohf-key-row-form" onSubmit={(event) => void onSave(event, provider)}>
                    <p className="ohf-key-row-hint">{HINTS[provider]}</p>
                    <input
                      className="ohf-input ohf-input--mono"
                      name="api_key"
                      type="password"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-label={`${PROVIDER_LABELS[provider]} key`}
                      placeholder={provider === "higgsfield" ? "id:secret" : "Paste key"}
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                    />
                    <div className="ohf-keys-actions">
                      <button
                        type="button"
                        className="ohf-btn-quiet"
                        onClick={() => {
                          setEditing(null);
                          setApiKey("");
                        }}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="ohf-keys-save" disabled={rowBusy || !apiKey.trim()}>
                        {rowBusy ? "Saving…" : saved ? "Replace key" : "Save key"}
                      </button>
                    </div>
                  </form>
                )}

                {rowNote && (
                  <p className="ohf-key-row-note" data-tone={rowNote.tone} role="status">
                    {rowNote.text}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {account && (
          <div className="ohf-keys-account">
            <span className="ohf-keys-account-email">Signed in as {account}</span>
            {onSignOut && (
              <button type="button" className="ohf-btn-quiet" onClick={onSignOut}>
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}

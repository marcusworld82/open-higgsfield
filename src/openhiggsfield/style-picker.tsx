"use client";

import { useCallback, useEffect, useState } from "react";

import { listGenjutsuStyles } from "@/generation/actions";
import type { GenjutsuPreset } from "@/generation/providers";

import { CheckIcon, KeyIcon, RetryIcon } from "./icons";

type Load =
  | { state: "loading" }
  | { state: "ready"; styles: GenjutsuPreset[] }
  | { state: "no-key" }
  | { state: "error"; message: string };

/* One list per page load: the styles are the account's, and they change
   rarely enough that a second fetch per mode switch is only waiting. */
let cache: GenjutsuPreset[] | null = null;

export function StylePicker({
  selectedId,
  selectedName,
  onPick,
  onOpenKeys,
}: {
  selectedId: string | null;
  selectedName: string | null;
  onPick: (style: GenjutsuPreset) => void;
  onOpenKeys: () => void;
}) {
  const [load, setLoad] = useState<Load>(cache ? { state: "ready", styles: cache } : { state: "loading" });
  const [open, setOpen] = useState(!selectedId);

  const fetchStyles = useCallback(async () => {
    const result = await listGenjutsuStyles();
    if (result.ok) {
      cache = result.value;
      setLoad({ state: "ready", styles: result.value });
      return;
    }
    if (result.code === "missing-key") setLoad({ state: "no-key" });
    else setLoad({ state: "error", message: result.error });
  }, []);

  useEffect(() => {
    if (!cache) void fetchStyles();
  }, [fetchStyles]);

  const selected = load.state === "ready" ? load.styles.find((style) => style.id === selectedId) : undefined;
  const gone = load.state === "ready" && selectedId && !selected;

  return (
    <div className="ohf-styles">
      {selectedId && !open ? (
        <button type="button" className="ohf-style-current" onClick={() => setOpen(true)} aria-expanded={false}>
          {selected?.previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- Higgsfield CDN preview */
            <img className="ohf-style-current-img" src={selected.previewUrl} alt="" />
          ) : (
            <span className="ohf-style-current-img" aria-hidden />
          )}
          <span className="ohf-style-current-text">
            <span className="ohf-style-current-name">{selected?.name ?? selectedName ?? "Style"}</span>
            <span className="ohf-style-current-hint">{gone ? "No longer offered — pick another" : "Change style"}</span>
          </span>
        </button>
      ) : null}

      {(open || !selectedId) && (
        <>
          {load.state === "loading" && (
            <div className="ohf-style-grid" aria-busy="true" aria-label="Loading styles">
              {Array.from({ length: 6 }, (_, index) => (
                <span key={index} className="ohf-style-skel" />
              ))}
            </div>
          )}
          {load.state === "no-key" && (
            <div className="ohf-style-note">
              <p>Styles come from your Higgsfield account. Add your key to load them.</p>
              <button type="button" className="ohf-btn-quiet" onClick={onOpenKeys}>
                <KeyIcon size={13} />
                Add Higgsfield key
              </button>
            </div>
          )}
          {load.state === "error" && (
            <div className="ohf-style-note" role="alert">
              <p>Styles did not load — {load.message}.</p>
              <button
                type="button"
                className="ohf-btn-quiet"
                onClick={() => {
                  setLoad({ state: "loading" });
                  void fetchStyles();
                }}
              >
                <RetryIcon />
                Try again
              </button>
            </div>
          )}
          {load.state === "ready" && load.styles.length === 0 && (
            <div className="ohf-style-note">
              <p>Your account has no restyle styles available right now.</p>
            </div>
          )}
          {load.state === "ready" && load.styles.length > 0 && (
            <div className="ohf-style-grid" role="radiogroup" aria-label="Restyle style">
              {load.styles.map((style) => {
                const on = style.id === selectedId;
                return (
                  <button
                    key={style.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className="ohf-style"
                    onClick={() => {
                      onPick(style);
                      setOpen(false);
                    }}
                  >
                    {style.previewUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- Higgsfield CDN preview */
                      <img className="ohf-style-img" src={style.previewUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="ohf-style-img" aria-hidden />
                    )}
                    <span className="ohf-style-name">{style.name}</span>
                    {on && (
                      <span className="ohf-style-check" aria-hidden>
                        <CheckIcon size={11} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

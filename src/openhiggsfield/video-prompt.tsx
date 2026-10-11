"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import type { MediaItem, Shot } from "@/generation/catalog";
import type { ShotSupport } from "@/generation/requirements";

import { CloseIcon, PlusIcon } from "./icons";
import { VideoStill } from "./video-still";

const PROMPT_MAX_HEIGHT = 260;

export type Taggable = { token: string; label: string; item: MediaItem };

/** "@Image1", "@Video2" — the handle the prompt uses for an attached input. */
export function taggablesOf(items: MediaItem[], roles: readonly string[]): Taggable[] {
  const out: Taggable[] = [];
  const nouns: Record<string, string> = { reference: "Image", video: "Video", audio: "Audio" };
  for (const role of ["reference", "video", "audio"]) {
    if (!roles.includes(role)) continue;
    items
      .filter((item) => item.role === role)
      .forEach((item, index) => {
        const noun = nouns[role]!;
        out.push({ token: `@${noun}${index + 1}`, label: `${noun} ${index + 1}`, item });
      });
  }
  return out;
}

function TagThumb({ item }: { item: MediaItem }) {
  if (item.role === "audio") return <span className="ohf-mention-glyph">♪</span>;
  if (item.role === "video" && !item.poster) return <VideoStill className="ohf-mention-thumb" src={item.url} />;
  /* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted user upload */
  return <img className="ohf-mention-thumb" src={item.poster || item.url} alt="" />;
}

/** The prompt, with an @ menu over the inputs it can point at. */
export function PromptField({
  id,
  value,
  onChange,
  placeholder,
  tags,
  focusNonce,
  onSubmit,
  header,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  tags: Taggable[];
  focusNonce: number;
  onSubmit: () => void;
  header: ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, PROMPT_MAX_HEIGHT)}px`;
  }, [value]);

  useEffect(() => {
    if (focusNonce > 0 && window.matchMedia("(min-width: 761px)").matches) ref.current?.focus();
  }, [focusNonce]);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return tags.filter((tag) => tag.token.slice(1).toLowerCase().startsWith(q) || tag.label.toLowerCase().replace(" ", "").startsWith(q));
  }, [query, tags]);

  function readQuery(el: HTMLTextAreaElement) {
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const match = /(?:^|\s)@(\w*)$/.exec(before);
    setQuery(match && tags.length ? match[1]! : null);
    setActive(0);
  }

  /* Inserts at the caret, replacing a half-typed "@ima" if there is one. */
  function insert(token: string) {
    const el = ref.current;
    const text = value;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const after = text.slice(caret);
    const partial = /@\w*$/.exec(before);
    const head = partial ? before.slice(0, partial.index) : before && !/\s$/.test(before) ? `${before} ` : before;
    const next = `${head}${token} ${after.replace(/^\s+/, "")}`;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      if (!el) return;
      const at = head.length + token.length + 1;
      el.focus();
      el.setSelectionRange(at, at);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (matches.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((current) => (current + step + matches.length) % matches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insert(matches[active]!.token);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit();
    }
  }

  const listId = `${id}-mentions`;
  return (
    <div className="ohf-vprompt">
      {header}
      <div className="ohf-vprompt-box">
        <textarea
          ref={ref}
          id={id}
          className="ohf-vprompt-input"
          rows={3}
          value={value}
          placeholder={placeholder}
          role={tags.length ? "combobox" : undefined}
          aria-expanded={tags.length ? matches.length > 0 : undefined}
          aria-controls={tags.length ? listId : undefined}
          aria-autocomplete={tags.length ? "list" : undefined}
          aria-activedescendant={matches.length ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            readQuery(event.target);
          }}
          onKeyDown={onKeyDown}
          onClick={(event) => readQuery(event.currentTarget)}
          onBlur={() => window.setTimeout(() => setQuery(null), 120)}
        />
        {matches.length > 0 && (
          <ul className="ohf-mentions" id={listId} role="listbox" aria-label="Inputs to tag">
            {matches.map((tag, index) => (
              <li key={tag.token} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  className="ohf-mention"
                  data-active={index === active}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => insert(tag.token)}
                >
                  <TagThumb item={tag.item} />
                  <span className="ohf-mention-token">{tag.token}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {tags.length > 0 && (
        <div className="ohf-tagbar" role="group" aria-label="Tag an input in the prompt">
          {tags.map((tag) => (
            <button key={tag.token} type="button" className="ohf-tagchip" onClick={() => insert(tag.token)}>
              <TagThumb item={tag.item} />
              {tag.token}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Multi-shot: each shot its own prompt and length; the lengths are the run's. */
export function ShotsEditor({
  shots,
  support,
  onChange,
}: {
  shots: Shot[];
  support: ShotSupport;
  onChange: (next: Shot[]) => void;
}) {
  const total = shots.reduce((sum, shot) => sum + shot.duration, 0);
  const over = shots.length > 0 && (total < support.min || total > support.max);
  const room = Math.max(1, Math.min(5, support.max - total));
  return (
    <div className="ohf-shots">
      {shots.map((shot, index) => (
        <div className="ohf-shot" key={index}>
          <div className="ohf-shot-head">
            <label className="ohf-shot-label" htmlFor={`ohf-shot-${index}`}>
              Shot {index + 1}
            </label>
            <div className="ohf-shot-len" role="group" aria-label={`Shot ${index + 1} length`}>
              <button
                type="button"
                className="ohf-shot-step"
                aria-label="Shorter"
                disabled={shot.duration <= 1}
                onClick={() => onChange(shots.map((entry, at) => (at === index ? { ...entry, duration: entry.duration - 1 } : entry)))}
              >
                −
              </button>
              <span className="ohf-shot-secs">{shot.duration}s</span>
              <button
                type="button"
                className="ohf-shot-step"
                aria-label="Longer"
                disabled={shot.duration >= 15}
                onClick={() => onChange(shots.map((entry, at) => (at === index ? { ...entry, duration: entry.duration + 1 } : entry)))}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="ohf-shot-remove"
              aria-label={`Remove shot ${index + 1}`}
              onClick={() => onChange(shots.filter((_, at) => at !== index))}
            >
              <CloseIcon size={11} />
            </button>
          </div>
          <textarea
            id={`ohf-shot-${index}`}
            className="ohf-shot-input"
            rows={2}
            maxLength={512}
            value={shot.prompt}
            placeholder="Wide shot, the runner turns the corner"
            onChange={(event) =>
              onChange(shots.map((entry, at) => (at === index ? { ...entry, prompt: event.target.value } : entry)))
            }
          />
        </div>
      ))}
      <div className="ohf-shots-foot">
        <button
          type="button"
          className="ohf-shots-add"
          disabled={shots.length >= 6 || total >= support.max}
          onClick={() => onChange([...shots, { prompt: "", duration: room }])}
        >
          <PlusIcon size={13} />
          Add shot
        </button>
        <span className="ohf-shots-total" data-bad={over}>
          {shots.length ? `${total}s of ${support.min}–${support.max}s` : support.required ? "Add 1–6 shots" : "Kling cuts the shots itself"}
        </span>
      </div>
    </div>
  );
}

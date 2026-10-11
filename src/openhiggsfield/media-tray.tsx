"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { MediaItem, MediaRole, ModelEntry } from "@/generation/catalog";
import { useImageMedia, useVideoMedia } from "@/generation/stores/media";
import { useSettings } from "@/generation/stores/settings";
import { uploadMedia } from "@/generation/upload";

import { ROLE_ACCEPT, ROLE_KINDS, ROLE_LABELS, ROLE_TAGS, roleLimits, rolesOf } from "./data";
import { AudioIcon, CloseIcon } from "./icons";
import { kindOfFile, captureVideoPoster, loadUploads, mergeUploads, rememberUpload, saveUploads, type UploadRecord } from "./uploads";
import { VideoStill } from "./video-still";

function useMedia(model: ModelEntry) {
  const imageMedia = useImageMedia();
  const videoMedia = useVideoMedia();
  return model.surface === "image" ? imageMedia : videoMedia;
}

export interface MediaTray {
  roles: MediaRole[];
  /** The current surface's attachments, so the picker can derive its own caps
      from the same list the strip below renders. */
  items: MediaItem[];
  /** Every file this browser has sent to Blob, newest first. */
  uploads: UploadRecord[];
  /** The URL of the last file uploaded from the picker. It goes onto the shelf
      and into the panel's selection, not onto the plane — the panel stages the
      whole set and one press applies it. */
  staged: string | null;
  uploading: boolean;
  allFull: boolean;
  /** Hidden file input; render it once inside the composer. */
  input: ReactNode;
  /** Set the role the next file takes, then open the OS picker. */
  begin: (role: MediaRole) => void;
  /** Open the OS picker and attach the file straight to the role once it has
      uploaded — the panel's empty slots skip the library when it is empty. */
  beginDirect: (role: MediaRole) => void;
  /** Upload a dropped file straight into a role. */
  drop: (role: MediaRole, file: File) => void;
  /** Detach one input. */
  remove: (id: string) => void;
  /** Make the role's inputs exactly these URLs — the picker hands back the set
      it edited, so one press both attaches and detaches. */
  apply: (role: MediaRole, urls: string[]) => void;
}

export function useMediaTray(
  model: ModelEntry,
  onError: (message: string | null) => void,
): MediaTray {
  const media = useMedia(model);
  const stored = useSettings((state) => state.byModel[model.id]);
  const limits = roleLimits(model, stored);
  const [uploading, setUploading] = useState(false);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [staged, setStaged] = useState<string | null>(null);
  const [uploadsLoaded, setUploadsLoaded] = useState(false);
  const roleRef = useRef<MediaRole>("reference");
  const directRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Read once, then write back on every change — the same order history takes,
     and for the same reason: writing before the read has landed would persist
     the empty initial value over the stored shelf. */
  useEffect(() => {
    let live = true;
    void loadUploads()
      .then((rows) => {
        if (!live) return;
        setUploads((current) => mergeUploads(rows, current));
        setUploadsLoaded(true);
      })
      .catch(() => {
        if (live) setUploadsLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (uploadsLoaded) void saveUploads(uploads);
  }, [uploadsLoaded, uploads]);

  const roles = rolesOf(model, stored);
  const counts: Record<string, number> = {};
  for (const role of roles) {
    counts[role] = media.items.filter((item) => item.role === role).length;
  }
  const allFull = roles.length > 0 && roles.every((role) => counts[role]! >= (limits[role] ?? 0));

  /* A direct attach fills an empty slot, or replaces the one frame a single
     slot holds; a full multi-slot role keeps what it has. */
  function attach(role: MediaRole, url: string, poster?: string) {
    /* Read the store fresh: the upload awaited, and the render this closure
       came from may no longer hold the plane. */
    const store = (model.surface === "image" ? useImageMedia : useVideoMedia).getState();
    const limit = limits[role] ?? 0;
    const held = store.items.filter((item) => item.role === role);
    if (limit === 1) for (const item of held) store.remove(item.id);
    else if (held.length >= limit) return;
    store.add({ id: crypto.randomUUID(), url, role, poster });
  }

  async function onFile(file: File | undefined, direct = directRef.current, role = roleRef.current) {
    if (!file) return;
    directRef.current = false;
    onError(null);
    setUploading(true);
    try {
      const [uploaded, poster] = await Promise.all([uploadMedia(file), captureVideoPoster(file)]);
      /* The file outlives this run: it joins the shelf the picker offers, so a
         reference used once can be reached again without a second upload. */
      if (direct) attach(role, uploaded.url, poster);
      else setStaged(uploaded.url);
      setUploads((prev) =>
        rememberUpload(prev, {
          id: crypto.randomUUID(),
          url: uploaded.url,
          kind: kindOfFile(file),
          name: file.name,
          createdAt: Date.now(),
          poster,
        }),
      );
    } catch (caught) {
      onError(
        caught instanceof Error
          ? `Upload failed — ${caught.message}. Check the Blob store is configured, then retry.`
          : "Upload failed. Retry, or drop the file and generate from the prompt alone.",
      );
    } finally {
      setUploading(false);
    }
  }

  /* accept is set on the element rather than through state: the picker opens in
     the same tick as the choice, before React could re-render it. */
  function begin(role: MediaRole) {
    const element = inputRef.current;
    if (!element) return;
    roleRef.current = role;
    directRef.current = false;
    element.accept = ROLE_ACCEPT[role];
    element.click();
  }

  function beginDirect(role: MediaRole) {
    const element = inputRef.current;
    if (!element) return;
    roleRef.current = role;
    directRef.current = true;
    element.accept = ROLE_ACCEPT[role];
    element.click();
  }

  function drop(role: MediaRole, file: File) {
    if (kindOfFile(file) !== ROLE_KINDS[role]) {
      onError(`That file is not ${ROLE_KINDS[role] === "image" ? "an image" : `a${ROLE_KINDS[role] === "audio" ? "n" : ""} ${ROLE_KINDS[role]}`} — drop one here, or tap the slot to pick.`);
      return;
    }
    void onFile(file, true, role);
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        void onFile(file);
      }}
    />
  );

  /* A replace, not an append: the panel edits one role's whole set, so what it
     hands back decides both what arrives and what leaves. Rows whose URL
     survives keep their id, and with it their place in the strip. */
  function apply(role: MediaRole, urls: string[]) {
    const keep = new Set(urls);
    const held = new Set<string>();
    for (const item of media.items) {
      if (item.role !== role) continue;
      if (keep.has(item.url)) held.add(item.url);
      else media.remove(item.id);
    }
    const posterOf = new Map(uploads.filter((row) => row.poster).map((row) => [row.url, row.poster]));
    for (const url of urls) {
      if (!held.has(url)) media.add({ id: crypto.randomUUID(), url, role, poster: posterOf.get(url) });
    }
  }

  return {
    roles,
    items: media.items,
    uploads,
    staged,
    uploading,
    allFull,
    input,
    begin,
    beginDirect,
    drop,
    remove: media.remove,
    apply,
  };
}

/** Attached inputs, above the prompt — the frames read before the words do. */
export function MediaStrip({ model }: { model: ModelEntry }) {
  const media = useMedia(model);
  const stored = useSettings((state) => state.byModel[model.id]);
  const limits = roleLimits(model, stored);
  const items = media.items.filter((item) => limits[item.role]);
  if (items.length === 0) return null;

  return (
    <ul className="ohf-strip">
      {items.map((item) => (
        <li key={item.id} className="ohf-strip-item">
          <span className="ohf-strip-tile">
            {item.role === "audio" ? (
              <span className="ohf-strip-glyph">
                <AudioIcon size={20} />
              </span>
            ) : item.role === "video" && !item.poster ? (
              <VideoStill className="ohf-strip-thumb" src={item.url} />
            ) : (
              /* Blob-hosted user upload; next/image would proxy an arbitrary
                 remote host for a 56px thumb. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                className="ohf-strip-thumb"
                src={item.poster || item.url}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.visibility = "hidden";
                }}
              />
            )}
            <span className="ohf-strip-tag">{ROLE_TAGS[item.role]}</span>
          </span>
          <button
            type="button"
            className="ohf-strip-remove"
            aria-label={`Remove ${ROLE_LABELS[item.role].toLowerCase()}`}
            onClick={() => media.remove(item.id)}
          >
            <CloseIcon size={10} />
          </button>
        </li>
      ))}
    </ul>
  );
}

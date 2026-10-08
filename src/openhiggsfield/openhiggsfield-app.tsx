"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getSessionState, signOut, type SessionState } from "@/auth/actions";
import { listProviderKeys, submitGeneration } from "@/generation/actions";
import { MissingCredentialsError, PROVIDER_LABELS, providerOfModel, type ProviderId } from "@/generation/credentials";
import type { KeySummaries } from "@/generation/key-store";
import { AuthRequired, unwrap } from "@/generation/result";
import { MODELS, getModel } from "@/generation/catalog";
import type { GenerationPlane, Surface } from "@/generation/catalog";
import { assemblePlane } from "@/generation/plane";
import type { GenerationStatus } from "@/generation/platform";
import { POLL_DEADLINE_MS, stopWatching, watchRequest } from "@/generation/poll";
import { useActive } from "@/generation/stores/active";
import { useImageMedia, useVideoMedia } from "@/generation/stores/media";
import { useImagePrompt, useVideoPrompt } from "@/generation/stores/prompt";
import { useSettings } from "@/generation/stores/settings";

import { GRAIN_URI, artFor } from "./artwork";
import { Composer } from "./composer";
import { fileNameFor, saveFile } from "./download";
import { KeyModal } from "./key-modal";
import {
  CROSS_VIEWS,
  countSetting,
  durationBadge,
  metaOf,
  ratioToCss,
  type GalleryView,
} from "./data";
import { Gallery } from "./gallery";
import { loadHistory, mergeHistory, replaceRequest, saveHistory, stepRun, type RunRecord } from "./history";
import { SignIn } from "./sign-in";
import { useTemplates } from "./use-templates";
import { useVisualViewport } from "./use-visual-viewport";
import { CloseIcon, UndoIcon } from "./icons";
import { SelectionBar, type SaveProgress } from "./selection-bar";
import { Topbar } from "./topbar";
import { Viewer } from "./viewer";

/* Long enough to read the bar and reach it; the drain line states the window. */
const UNDO_MS = 6000;

export interface ActiveRun {
  /** Identifies the skeleton this run occupies, so a batch clears one tile at
      a time as its own request settles. */
  id: string;
  surface: Surface;
  modelLabel: string;
  ratio: string;
  startedAt: number;
}

type RunDraft = {
  surface: Surface;
  modelId: string;
  modelLabel: string;
  prompt: string;
  ratio: string;
  meta: string;
  badge?: string;
  settings?: Record<string, unknown>;
  inputs?: RunRecord["inputs"];
  createdAt: number;
};

function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function rowId(requestId: string, offset: number, count: number): string {
  return count > 1 ? `${requestId}#${offset}` : requestId;
}

function draftOf(record: RunRecord): RunDraft {
  return {
    surface: record.surface,
    modelId: record.modelId,
    modelLabel: record.modelLabel,
    prompt: record.prompt,
    ratio: record.ratio,
    meta: record.meta,
    badge: record.badge,
    settings: record.settings,
    inputs: record.inputs,
    createdAt: record.createdAt,
  };
}

function runningRows(requestId: string, count: number, draft: RunDraft): RunRecord[] {
  return Array.from({ length: count }, (_, offset) => {
    const id = rowId(requestId, offset, count);
    return {
      id,
      requestId,
      surface: draft.surface,
      modelId: draft.modelId,
      modelLabel: draft.modelLabel,
      prompt: draft.prompt,
      ratio: draft.ratio,
      meta: draft.meta,
      badge: draft.badge,
      kind: draft.surface,
      urls: [],
      status: "running",
      art: artFor(draft.surface, hueOf(id), id),
      createdAt: draft.createdAt,
      settings: draft.settings,
      inputs: draft.inputs,
    };
  });
}

function terminalRows(requestId: string, draft: RunDraft, status: GenerationStatus): RunRecord[] {
  const urls =
    status.images?.map((image) => image.url) ?? (status.video ? [status.video.url] : []);
  const completed = status.status === "completed" && urls.length > 0;
  const base = status.requestId || requestId;
  const failure = completed ? undefined : failureText(status);
  const delivered: Array<string | null> = completed ? urls : [null];
  return delivered.map((url, offset) => {
    const id = rowId(base, offset, delivered.length);
    return {
      id,
      requestId: base,
      surface: draft.surface,
      modelId: draft.modelId,
      modelLabel: draft.modelLabel,
      prompt: draft.prompt,
      ratio: draft.ratio,
      meta: draft.meta,
      badge: draft.badge,
      kind: draft.surface,
      urls: url ? [url] : [],
      status: completed ? "completed" : "failed",
      error: failure,
      art: artFor(draft.surface, hueOf(id), id),
      createdAt: draft.createdAt,
      settings: draft.settings,
      inputs: draft.inputs,
    };
  });
}

function failedRows(requestId: string, count: number, draft: RunDraft, error: string): RunRecord[] {
  return runningRows(requestId, count, draft).map((row) => ({
    ...row,
    status: "failed" as const,
    error,
  }));
}

function failureText(status: GenerationStatus): string {
  if (status.status === "nsfw") return "the platform flagged the result as NSFW";
  if (status.status === "canceled") return "the run was canceled";
  if (typeof status.error === "string" && status.error) return status.error;
  return "the platform reported a failure";
}

function bannerFor(record: { error?: string; modelId?: string } | undefined): string {
  const reason = record?.error || "the provider reported a failure";
  if (reason === "Generation failed") {
    return "Higgsfield accepted the job and failed it, with no reason. Nothing was charged. Retry it.";
  }
  return `Run not delivered — ${reason}.`;
}

const NO_KEYS: KeySummaries = { higgsfield: null, openai: null, google: null, kie: null };

function describeError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught);
  if (caught instanceof MissingCredentialsError) {
    return `Add your ${PROVIDER_LABELS[caught.provider]} key to generate.`;
  }
  if (caught instanceof AuthRequired) return "You were signed out. Sign in again to keep generating.";
  return `Generation failed — ${message}. Try again; if it repeats, check the key.`;
}

function inputsOf(plane: GenerationPlane): RunRecord["inputs"] {
  const inputs: NonNullable<RunRecord["inputs"]> = [];
  for (const role of ["start", "end", "reference", "video", "audio"] as const) {
    for (const item of plane.media[role] ?? []) {
      if (!item.url.startsWith("blob:")) inputs.push({ role: item.role, url: item.url });
    }
  }
  return inputs.length > 0 ? inputs : undefined;
}

export function OpenHiggsfieldApp({ fontClassName = "" }: { fontClassName?: string }) {
  const surface = useActive((state) => state.surface);
  const modelId = useActive((state) => state.model);
  const setModel = useActive((state) => state.setModel);
  const model = getModel(modelId);
  const setSettings = useSettings((state) => state.set);
  useVisualViewport();

  const [history, setHistory] = useState<RunRecord[]>([]);
  const [runs, setRuns] = useState<ActiveRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [view, setView] = useState<GalleryView>(surface);
  const [focusNonce, setFocusNonce] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  /* Deleting drops the only copy of a run — the platform's result URLs are not
     re-derivable — so the records are held aside until the bar times out. */
  const [deleted, setDeleted] = useState<RunRecord[] | null>(null);
  /* Picked runs, in the order they were picked: the count stack shows the most
     recent sheets on top, and a range extends from the last one touched. */
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState<SaveProgress | null>(null);
  /* null until the server says whether sign-in is set up and who is signed in. */
  const [session, setSession] = useState<SessionState | null>(null);
  const signedIn = session?.configured === true && session.email !== null && session.owner;
  const needsSignIn = session?.configured === true && !signedIn;
  const remoteTemplates = session === null ? null : session.configured ? (signedIn ? true : null) : false;
  const [summaries, setSummaries] = useState<KeySummaries>(NO_KEYS);
  const keys = useMemo(
    () => ({
      higgsfield: Boolean(summaries.higgsfield),
      openai: Boolean(summaries.openai),
      google: Boolean(summaries.google),
      kie: Boolean(summaries.kie),
    }),
    [summaries],
  );
  const [keyProvider, setKeyProvider] = useState<ProviderId>("higgsfield");
  const [keysOpen, setKeysOpen] = useState(false);
  const keyConfigured = keys.higgsfield || keys.openai || keys.google || keys.kie;
  const templateStore = useTemplates(remoteTemplates, setError);
  const templates = templateStore.templates;

  const galleryRef = useRef<HTMLDivElement>(null);
  const rangeAnchor = useRef<number | null>(null);
  const visibleRef = useRef<RunRecord[]>([]);
  /* Presses number their own skeletons, so two batches in flight together can
     never claim the same tile. */
  const press = useRef(0);
  const alive = useRef(true);
  const freshTimers = useRef<number[]>([]);
  const historyRef = useRef(history);
  historyRef.current = history;

  /* The model picker can cross surfaces, so the scope follows it — unless the
     visitor parked on a scope that spans both. */
  useEffect(() => {
    setView((current) => (CROSS_VIEWS.has(current) ? current : surface));
  }, [surface]);

  /* Read once on mount. A load that finishes after unmount must not mark the
     next mount hydrated, or the empty initial list is written over the store. */
  useEffect(() => {
    let live = true;
    void loadHistory()
      .then((rows) => {
        if (!live) return;
        setHistory((current) => mergeHistory(rows, current));
        setHistoryLoaded(true);
      })
      .catch(() => {
        if (live) setHistoryLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (historyLoaded) void saveHistory(history);
  }, [historyLoaded, history]);

  useEffect(() => {
    let live = true;
    void getSessionState()
      .then((next) => {
        if (live) setSession(next);
      })
      .catch(() => {
        if (live) setSession({ configured: false });
      });
    return () => {
      live = false;
    };
  }, []);

  /* Keys are read once the session is known: from the account when signed
     in, from the cookie when sign-in is not set up. No key at all opens the
     panel, so a first visit never fails silently. */
  useEffect(() => {
    if (session === null || needsSignIn) return;
    let live = true;
    void listProviderKeys().then((result) => {
      if (!live) return;
      if (!result.ok) {
        if (result.code === "auth") setSession((prev) => (prev?.configured ? { ...prev, email: null } : prev));
        else setError(`Saved keys did not load — ${result.error}`);
        return;
      }
      setSummaries(result.value);
      if (!Object.values(result.value).some(Boolean)) setKeysOpen(true);
    });
    return () => {
      live = false;
    };
  }, [session, needsSignIn]);

  const onSignOut = useCallback(async () => {
    await signOut();
    setKeysOpen(false);
    setSummaries(NO_KEYS);
    setSession((prev) => (prev?.configured ? { ...prev, email: null, owner: false } : prev));
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopWatching();
      for (const timer of freshTimers.current) clearTimeout(timer);
    };
  }, []);

  /* Each arrival blooms on its own clock: a batch lands over several seconds,
     and one shared timer would cut the last tile's entrance short. */
  const markFresh = useCallback((ids: string[]) => {
    setFreshIds((prev) => [...prev, ...ids]);
    freshTimers.current.push(
      window.setTimeout(
        () => setFreshIds((prev) => prev.filter((id) => !ids.includes(id))),
        900,
      ),
    );
  }, []);

  /* One watch per platform request, used both by Generate and by a reload that
     found running rows already in the log. */
  const resume = useCallback(
    async (requestId: string, draft: RunDraft, expected: number) => {
      try {
        const status = await watchRequest(requestId, {
          deadline: draft.createdAt + POLL_DEADLINE_MS,
        });
        if (!alive.current) return;
        const records = terminalRows(requestId, draft, status);
        setHistory((prev) => {
          const next = replaceRequest(prev, requestId, records);
          void saveHistory(next);
          return next;
        });
        markFresh(records.filter((record) => record.status === "completed").map((record) => record.id));
        if (records.some((record) => record.status === "failed")) {
          const failure = records.find((record) => record.status === "failed");
          setError((prev) => prev ?? bannerFor(failure));
        }
      } catch (caught) {
        if (!alive.current) return;
        const message = describeError(caught);
        if (caught instanceof MissingCredentialsError) setKeysOpen(true);
        if (caught instanceof AuthRequired) setSession((prev) => (prev?.configured ? { ...prev, email: null } : prev));
        setHistory((prev) => {
          const next = replaceRequest(prev, requestId, failedRows(requestId, expected, draft, message));
          void saveHistory(next);
          return next;
        });
        setError((prev) => prev ?? message);
      }
    },
    [markFresh],
  );

  /* After the log hydrates, pick up any request that was still on the platform
     when the last session died. Generate starts its own watch; this is the
     refresh path. */
  useEffect(() => {
    if (!historyLoaded) return;
    const groups = new Map<string, RunRecord[]>();
    for (const record of historyRef.current) {
      if (record.status !== "running" || !record.requestId) continue;
      const rows = groups.get(record.requestId) ?? [];
      rows.push(record);
      groups.set(record.requestId, rows);
    }
    for (const [requestId, rows] of groups) {
      void resume(requestId, draftOf(rows[0]!), rows.length);
    }
  }, [historyLoaded, resume]);

  const visible = useMemo(() => {
    if (view === "templates") return templates;
    if (view === "assets") return history;
    if (view === "favorites") return history.filter((record) => record.favorite === true);
    return history.filter((record) => record.surface === view);
  }, [history, templates, view]);

  const switchView = useCallback(
    (next: GalleryView) => {
      setView(next);
      galleryRef.current?.scrollTo({ top: 0 });
      if (CROSS_VIEWS.has(next) || next === surface) return;
      const first = MODELS.find((entry) => entry.surface === next);
      if (first) setModel(first.id);
    },
    [setModel, surface],
  );

  /* Presses do not wait on each other. A press snapshots its own plane, opens
     its own skeletons and keeps its own watch, so the composer is free the
     moment the tiles appear and any number of runs can be in flight. */
  const generate = useCallback(async () => {
    const plane = assemblePlane();
    const entry = getModel(plane.model);
    const needed = providerOfModel(entry.provider);
    const coveredByKie = (needed === "openai" || needed === "google") && keys.kie;
    if (!keys[needed] && !coveredByKie) {
      const promptFor = needed === "higgsfield" ? "higgsfield" : "kie";
      setKeyProvider(promptFor);
      setKeysOpen(true);
      setError(
        needed === "higgsfield"
          ? "Add your Higgsfield key to generate."
          : "Add your KIE.AI key to generate. OpenAI or Google still work if you save those instead.",
      );
      return;
    }
    if (entry.id === "genjutsu") {
      const hasVideo = (plane.media.video ?? []).length > 0;
      const hasImage = (plane.media.reference ?? []).length > 0;
      if (!hasVideo || (plane.settings.mode !== "restyle" && !hasImage)) {
        setError(
          plane.settings.mode === "restyle"
            ? "Genjutsu restyle needs a source video."
            : "Genjutsu needs a source video and at least one reference image.",
        );
        return;
      }
    } else if (!plane.prompt.text.trim()) {
      return;
    }

    const ratio = ratioToCss(
      plane.settings.aspectRatio,
      entry.surface === "image" ? "4 / 3" : "16 / 9",
    );
    const meta = metaOf(entry, plane.settings);
    const badge = entry.surface === "video" ? durationBadge(plane.settings) : undefined;

    /* Batch size resolves to results, not to requests. A model that carries its
       own count answers one request with that many media; every other model is
       submitted once per result. Either way the grid opens the same number of
       skeletons, and each request clears the ones it owns. */
    const native = countSetting(entry);
    const expected = native
      ? Math.max(1, Number(plane.settings[native.key]) || 1)
      : useActive.getState().batch;
    const startedAt = Date.now();
    const seq = ++press.current;
    const pending: ActiveRun[] = Array.from({ length: expected }, (_, index) => ({
      id: `pending-${seq}-${index}`,
      surface: entry.surface,
      modelLabel: entry.label,
      ratio,
      startedAt,
    }));
    const slots = native
      ? [{ skeletons: pending.map((slot) => slot.id) }]
      : pending.map((slot) => ({ skeletons: [slot.id] }));
    const draft: RunDraft = {
      surface: entry.surface,
      modelId: entry.id,
      modelLabel: entry.label,
      prompt: plane.prompt.text.trim(),
      ratio,
      meta,
      badge,
      settings: plane.settings,
      inputs: inputsOf(plane),
      createdAt: startedAt,
    };

    setError(null);
    /* Newest press on top, above whatever is still rendering from the last. */
    setRuns((prev) => [...pending, ...prev]);
    galleryRef.current?.scrollTo({ top: 0, behavior: "smooth" });

    const runOne = async (slot: { skeletons: string[] }) => {
      try {
        const queued = unwrap(await submitGeneration(plane));
        if (queued.done) {
          const records = terminalRows(queued.requestId, draft, queued.done);
          setHistory((prev) => {
            const next = [...records, ...prev];
            void saveHistory(next);
            return next;
          });
          markFresh(records.filter((record) => record.status === "completed").map((record) => record.id));
          if (records.some((record) => record.status === "failed")) {
            setError((prev) => prev ?? bannerFor(records.find((record) => record.status === "failed")));
          }
          return;
        }
        setHistory((prev) => {
          const next = [...runningRows(queued.requestId, slot.skeletons.length, draft), ...prev];
          void saveHistory(next);
          return next;
        });
        setRuns((prev) => prev.filter((active) => !slot.skeletons.includes(active.id)));
        await resume(queued.requestId, draft, slot.skeletons.length);
      } catch (caught) {
        if (!alive.current) return;
        const message = describeError(caught);
        if (caught instanceof MissingCredentialsError) {
          setKeyProvider(caught.provider);
          setKeysOpen(true);
        }
        if (caught instanceof AuthRequired) setSession((prev) => (prev?.configured ? { ...prev, email: null } : prev));
        setError((prev) => prev ?? message);
      } finally {
        if (alive.current) {
          setRuns((prev) => prev.filter((active) => !slot.skeletons.includes(active.id)));
        }
      }
    };

    await Promise.all(slots.map(runOne));
  }, [keys, markFresh, resume]);

  /* Reuse restores the whole plane the run was made from — model, its dials,
     then the words. A reuse that dropped the ratio and resolution would
     re-render a different picture from the same prompt. */
  const retry = useCallback(
    (record: RunRecord) => {
      if (MODELS.some((entry) => entry.id === record.modelId)) {
        setModel(record.modelId);
        if (record.settings) setSettings(record.modelId, record.settings);
      }
      (record.surface === "image" ? useImagePrompt : useVideoPrompt).getState().setText(record.prompt);
      const media = record.surface === "image" ? useImageMedia : useVideoMedia;
      if (record.inputs?.length) {
        media.getState().replace(
          record.inputs.map((input, index) => ({
            id: `${record.id}-in-${index}`,
            role: input.role,
            url: input.url,
          })),
        );
      }
      setViewerId(null);
      setError(null);
      setFocusNonce((n) => n + 1);
    },
    [setModel, setSettings],
  );

  const { add: addTemplate, update: updateTemplate, remove: removeTemplate } = templateStore;
  const toggleFavorite = useCallback((record: RunRecord) => {
    if (record.id.startsWith("template-")) {
      void updateTemplate(record.id, { favorite: !record.favorite });
      return;
    }
    setHistory((prev) =>
      prev.map((entry) =>
        entry.id === record.id ? { ...entry, favorite: !entry.favorite } : entry,
      ),
    );
  }, [updateTemplate]);

  const deleteRuns = useCallback((records: RunRecord[]) => {
    if (records.length === 0) return;
    const ids = new Set(records.map((record) => record.id));
    setHistory((prev) => prev.filter((entry) => !ids.has(entry.id)));
    setDeleted(records);
  }, []);

  const deleteRun = useCallback((record: RunRecord) => {
    if (record.id.startsWith("template-")) {
      void removeTemplate(record.id);
      return;
    }
    deleteRuns([record]);
  }, [deleteRuns, removeTemplate]);

  const saveAsTemplate = useCallback((record: RunRecord) => {
    if (record.status !== "completed" || record.urls.length === 0) return;
    void addTemplate(record);
    setView("templates");
    setViewerId(null);
  }, [addTemplate]);

  /* History is newest-first by construction, so the restored runs drop back
     into their own places rather than onto the top of the grid. */
  const restoreDeleted = useCallback(() => {
    if (!deleted) return;
    setHistory((prev) => {
      const here = new Set(prev.map((entry) => entry.id));
      const back = deleted.filter((entry) => !here.has(entry.id));
      if (back.length === 0) return prev;
      return [...prev, ...back].sort((a, b) => b.createdAt - a.createdAt);
    });
    setDeleted(null);
  }, [deleted]);

  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => setDeleted(null), UNDO_MS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeleted(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [deleted]);

  /* ---------- picking runs ----------

     The grid is in selection mode whenever something is picked, so the mode has
     no switch of its own: the checkbox that appears on hover is the way in, and
     the toolbar's cross is the way out. */

  const pickedSet = useMemo(() => new Set(selected), [selected]);
  const byId = useMemo(() => new Map(history.map((record) => [record.id, record])), [history]);
  const pickedRecords = useMemo(
    () => selected.map((id) => byId.get(id)).filter((record) => record !== undefined),
    [selected, byId],
  );

  /* The range gesture walks the scope the visitor is looking at, and the walk
     happens inside the handler — reading it from a dependency would rebuild the
     callback on every history change and re-render all forty tiles with it. */
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  /* A run that left the grid cannot stay picked — deleted, aged out of the cap,
     or released from the shelf while the Favorites scope was the one on screen.
     The toolbar counts what the visitor can still see it acting on. */
  const visibleIds = useMemo(() => new Set(visible.map((record) => record.id)), [visible]);
  useEffect(() => {
    setSelected((prev) => {
      const next = prev.filter((id) => visibleIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [visibleIds]);

  /* Switching scope switches what "everything picked" means, so the selection
     does not travel with it. */
  useEffect(() => {
    setSelected([]);
    rangeAnchor.current = null;
  }, [view]);

  const clearPicked = useCallback(() => {
    setSelected([]);
    rangeAnchor.current = null;
  }, []);

  const togglePick = useCallback((id: string, index: number, range: boolean) => {
    const from = rangeAnchor.current;
    rangeAnchor.current = index;
    setSelected((prev) => {
      if (range && from !== null) {
        const span = visibleRef.current
          .slice(Math.min(from, index), Math.max(from, index) + 1)
          .filter((record) => record.status !== "running")
          .map((record) => record.id);
        const held = new Set(prev);
        return [...prev, ...span.filter((entry) => !held.has(entry))];
      }
      return prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id];
    });
  }, []);

  /* Escape leaves the selection the way it leaves every other transient layer
     in the studio. The viewer owns the key while it is open. */
  useEffect(() => {
    if (selected.length === 0 || viewerId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearPicked();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected.length, viewerId, clearPicked]);

  /* One keep for the whole selection: if every picked run is already kept the
     press releases them, which is what a pressed control has to mean. */
  const favoritePicked = useCallback(() => {
    const ids = new Set(selected);
    const keep = !pickedRecords.every((record) => record.favorite === true);
    setHistory((prev) =>
      prev.map((entry) => (ids.has(entry.id) ? { ...entry, favorite: keep } : entry)),
    );
  }, [selected, pickedRecords]);

  const deletePicked = useCallback(() => {
    deleteRuns(pickedRecords);
    clearPicked();
  }, [deleteRuns, pickedRecords, clearPicked]);

  /* One run, saved from its card. The refusal is reported through the strip the
     composer already reserves for it — a 32px button on a picture has no room
     to explain itself, and the viewer's own Download states what to do next. */
  const downloadRun = useCallback(async (record: RunRecord) => {
    const url = record.urls[0];
    if (!url) return;
    const ok = await saveFile(url, fileNameFor(record, 0));
    if (!ok) {
      setError(
        "The platform’s CDN refused the read, so this run could not be saved. Open it to save it from the browser instead.",
      );
    }
  }, []);

  /* Saved one at a time on purpose: browsers throttle a burst of downloads into
     a single "allow multiple files?" prompt and drop the rest, and a sequence is
     the only version that can report how far it got. */
  const downloadPicked = useCallback(async () => {
    const files = pickedRecords.filter((record) => record.urls[0]);
    if (files.length === 0) return;
    setSaving({ done: 0, total: files.length });
    let refused = 0;
    for (const [index, record] of files.entries()) {
      const ok = await saveFile(record.urls[0]!, fileNameFor(record, index));
      if (!ok) refused++;
      setSaving({ done: index + 1, total: files.length });
    }
    setSaving(null);
    if (refused > 0) {
      setError(
        refused === files.length
          ? "The platform’s CDN refused the read, so nothing could be saved. Open a run to save it from the browser instead."
          : `${refused} of ${files.length} files could not be saved — the platform’s CDN refused the read. Open those runs to save them from the browser.`,
      );
    }
  }, [pickedRecords]);

  /* An empty-gallery starter loads the composer and hands the visitor the
     caret; pressing Generate stays their call. */
  const applyStarter = useCallback(
    (text: string) => {
      (surface === "image" ? useImagePrompt : useVideoPrompt).getState().setText(text);
      setError(null);
      setFocusNonce((n) => n + 1);
    },
    [surface],
  );

  const openViewer = useCallback((id: string) => setViewerId(id), []);
  const openKeys = useCallback(() => setKeysOpen(true), []);
  const runGenerate = useCallback(() => void generate(), [generate]);
  const downloadSelection = useCallback(() => void downloadPicked(), [downloadPicked]);
  const dismissDeleted = useCallback(() => setDeleted(null), []);
  const viewerItem = viewerId
    ? [...history, ...templates].find((record) => record.id === viewerId && record.status !== "running") ??
      null
    : null;

  /* The walk follows the scope on screen, not the whole log: arrowing out of
     the viewer never lands on a run the grid behind it is not showing. At
     either end there is no neighbour to hand down, and the step goes quiet. */
  const viewable = useMemo(
    () => visible.filter((record) => record.status !== "running"),
    [visible],
  );
  const prevRun = viewerId ? stepRun(viewable, viewerId, -1) : null;
  const nextRun = viewerId ? stepRun(viewable, viewerId, 1) : null;

  const runsHere = useMemo(
    () => runs.filter((active) => view === "assets" || active.surface === view),
    [runs, view],
  );
  const busy = runs.length > 0 || history.some((record) => record.status === "running");

  if (needsSignIn) {
    return (
      <div className={`ohf ${fontClassName}`} style={{ "--ohf-grain": GRAIN_URI } as React.CSSProperties}>
        <SignIn onSignedIn={(next) => setSession(next)} />
      </div>
    );
  }

  return (
    <div className={`ohf ${fontClassName}`} style={{ "--ohf-grain": GRAIN_URI } as React.CSSProperties}>
      <div className="ohf-shell">
        <main className="ohf-main">
          <Topbar
            view={view}
            onView={switchView}
            busy={busy}
            keyConfigured={keyConfigured}
            onKeys={openKeys}
          />

          <Gallery
            view={view}
            surface={surface}
            items={visible}
            runs={runsHere}
            freshIds={freshIds}
            picked={pickedSet}
            onOpen={openViewer}
            onPick={togglePick}
            onReuse={retry}
            onFavorite={toggleFavorite}
            onDownload={downloadRun}
            onDelete={deleteRun}
            onSaveTemplate={view === "templates" ? undefined : saveAsTemplate}
            onStarter={applyStarter}
            galleryRef={galleryRef}
          />

          <Composer
            surface={surface}
            model={model}
            generating={busy}
            error={error}
            focusNonce={focusNonce}
            history={history}
            selecting={selected.length > 0}
            selection={
              <SelectionBar
                records={pickedRecords}
                saving={saving}
                onDownload={downloadSelection}
                onFavorite={favoritePicked}
                onDelete={deletePicked}
                onClose={clearPicked}
              />
            }
            onError={setError}
            onGenerate={runGenerate}
            notice={
              deleted && (
                <UndoBar
                  records={deleted}
                  onUndo={restoreDeleted}
                  onDismiss={dismissDeleted}
                />
              )
            }
          />
        </main>

        {viewerItem && (
          <Viewer
            item={viewerItem}
            onPrev={prevRun ? () => setViewerId(prevRun.id) : undefined}
            onNext={nextRun ? () => setViewerId(nextRun.id) : undefined}
            onClose={() => setViewerId(null)}
            onReuse={() => retry(viewerItem)}
            onSaveTemplate={
              viewerItem.id.startsWith("template-") ? undefined : () => saveAsTemplate(viewerItem)
            }
            onEditTemplate={
              viewerItem.id.startsWith("template-")
                ? (patch) => updateTemplate(viewerItem.id, patch)
                : undefined
            }
            onFavorite={() => toggleFavorite(viewerItem)}
            /* The viewer is released along with the run, so undoing the
               delete restores it to the grid and not back over the studio. */
            onDelete={() => {
              setViewerId(null);
              deleteRun(viewerItem);
            }}
          />
        )}
        {keysOpen && (
          <KeyModal
            summaries={summaries}
            initialProvider={keyProvider}
            account={signedIn && session?.configured ? session.email : null}
            onClose={() => setKeysOpen(false)}
            onChange={(next) => {
              setSummaries(next);
              setError(null);
            }}
            onSignOut={signedIn ? () => void onSignOut() : undefined}
          />
        )}
      </div>
    </div>
  );
}

/* Deletion's receipt, in the strip the composer already reserves for the
   generation error — the studio gains no second floating layer. The hairline
   drains across the bar so the window to change your mind is visible, not
   guessed at. */
function UndoBar({
  records,
  onUndo,
  onDismiss,
}: {
  records: RunRecord[];
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const one = records.length === 1 ? records[0] : null;
  /* The words name the run to the person who wrote them; the model does not —
     a grid made on one model reads back as the same label over and over. Runs
     submitted without a prompt keep the model as their only name. The verb
     leads so a long prompt loses its tail to the ellipsis, not the sentence. */
  const subject = one
    ? one.prompt
      ? `“${one.prompt}”`
      : `${one.modelLabel} run`
    : `${records.length} runs`;

  return (
    <div className="ohf-undo" role="status">
      <span
        className="ohf-undo-drain"
        style={{ animationDuration: `${UNDO_MS}ms` }}
        aria-hidden
      />
      <span className="ohf-undo-text">{`Deleted ${subject}`}</span>
      <button type="button" className="ohf-undo-act" onClick={onUndo}>
        <UndoIcon />
        Undo
      </button>
      <button
        type="button"
        className="ohf-icon-btn ohf-icon-btn--ghost"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}

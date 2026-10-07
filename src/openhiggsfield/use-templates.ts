"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Surface } from "@/generation/catalog";
import { unwrap } from "@/generation/result";

import { artFor } from "./artwork";
import type { RunRecord } from "./history";
import { createTemplates, deleteTemplate, listTemplates, updateTemplate } from "./template-actions";
import { recordToInsert, rowIdOf, rowToRecord, type TemplatePatch } from "./template-rows";
import { loadTemplates, saveTemplates, templateFrom } from "./templates";

function artOf(surface: Surface, id: string): string {
  let hue = 0;
  for (let i = 0; i < id.length; i++) hue = (hue * 31 + id.charCodeAt(i)) % 360;
  return artFor(surface, hue, id);
}

/**
 * Templates live in Supabase when the visitor is signed in, and in this
 * browser's IndexedDB otherwise. `remote` is null until the session is known,
 * so nothing loads twice. The first signed-in load moves any templates this
 * browser kept on its own into Supabase, then clears the local copy.
 */
export function useTemplates(remote: boolean | null, onError: (message: string) => void) {
  const [templates, setTemplates] = useState<RunRecord[]>([]);
  // Which session the current list was loaded for. A change of session makes
  // `loaded` false until the new list is in.
  const [loadedFor, setLoadedFor] = useState<boolean | null>(null);
  const loaded = remote !== null && loadedFor === remote;
  const errorRef = useRef(onError);
  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (remote === null) return;
    let live = true;
    void (async () => {
      if (!remote) {
        const rows = await loadTemplates();
        if (live) {
          setTemplates(rows);
          setLoadedFor(false);
        }
        return;
      }
      try {
        let rows = unwrap(await listTemplates());
        const local = await loadTemplates();
        if (local.length > 0) {
          const moved = unwrap(await createTemplates(local.map(recordToInsert)));
          await saveTemplates([]);
          rows = [...moved, ...rows];
        }
        if (!live) return;
        setTemplates(
          rows.map((row) => rowToRecord(row, artOf)).sort((a, b) => b.createdAt - a.createdAt),
        );
      } catch (caught) {
        if (live) errorRef.current(`Templates did not load — ${messageOf(caught)}`);
      } finally {
        if (live) setLoadedFor(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [remote]);

  /* Signed out, the browser copy is the only copy, so every change is written. */
  useEffect(() => {
    if (loaded && remote === false) void saveTemplates(templates);
  }, [loaded, remote, templates]);

  const add = useCallback(
    async (record: RunRecord) => {
      const draft = templateFrom(record);
      setTemplates((prev) => [draft, ...prev]);
      if (!remote) return;
      try {
        const [row] = unwrap(await createTemplates([recordToInsert(draft)]));
        if (!row) throw new Error("the server saved nothing");
        const saved = rowToRecord(row, artOf);
        setTemplates((prev) => prev.map((entry) => (entry.id === draft.id ? saved : entry)));
      } catch (caught) {
        setTemplates((prev) => prev.filter((entry) => entry.id !== draft.id));
        errorRef.current(`Template not saved — ${messageOf(caught)}`);
      }
    },
    [remote],
  );

  const update = useCallback(
    async (id: string, patch: TemplatePatch): Promise<boolean> => {
      let before: RunRecord | undefined;
      setTemplates((prev) =>
        prev.map((entry) => {
          if (entry.id !== id) return entry;
          before = entry;
          return {
            ...entry,
            ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
            ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
            ...(patch.name !== undefined ? { name: patch.name ?? undefined } : {}),
          };
        }),
      );
      const rowId = rowIdOf(id);
      if (!remote || !rowId) return true;
      try {
        const row = unwrap(await updateTemplate(rowId, patch));
        const saved = rowToRecord(row, artOf);
        setTemplates((prev) => prev.map((entry) => (entry.id === id ? saved : entry)));
        return true;
      } catch (caught) {
        if (before) {
          const restore = before;
          setTemplates((prev) => prev.map((entry) => (entry.id === id ? restore : entry)));
        }
        errorRef.current(`Template not updated — ${messageOf(caught)}`);
        return false;
      }
    },
    [remote],
  );

  const remove = useCallback(
    async (id: string) => {
      let removed: { record: RunRecord; index: number } | null = null;
      setTemplates((prev) => {
        const index = prev.findIndex((entry) => entry.id === id);
        if (index >= 0) removed = { record: prev[index]!, index };
        return prev.filter((entry) => entry.id !== id);
      });
      const rowId = rowIdOf(id);
      if (!remote || !rowId) return;
      try {
        unwrap(await deleteTemplate(rowId));
      } catch (caught) {
        const back = removed as { record: RunRecord; index: number } | null;
        if (back) {
          setTemplates((prev) => {
            const next = [...prev];
            next.splice(back.index, 0, back.record);
            return next;
          });
        }
        errorRef.current(`Template not deleted — ${messageOf(caught)}`);
      }
    },
    [remote],
  );

  return { templates, add, update, remove };
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

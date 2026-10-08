import type { MediaRole, Surface } from "@/generation/catalog";

import type { RunRecord } from "./history";

/** One row of public.ohf_templates as the app reads and writes it. */
export type TemplateRow = {
  id: string;
  name: string | null;
  surface: Surface;
  model_id: string;
  model_label: string;
  prompt: string;
  settings: Record<string, unknown>;
  inputs: Array<{ role: MediaRole; url: string }>;
  urls: string[];
  ratio: string;
  meta: string;
  badge: string | null;
  favorite: boolean;
  created_at: string;
};

export type TemplateInsert = Omit<TemplateRow, "id" | "created_at">;

export type TemplatePatch = { name?: string | null; prompt?: string; favorite?: boolean };

export const TEMPLATE_PREFIX = "template-";
const ROLES = new Set<MediaRole>(["start", "end", "reference", "video", "audio"]);

export function templateId(rowId: string): string {
  return `${TEMPLATE_PREFIX}${rowId}`;
}

/** The database id behind a template record, or null for a local-only one. */
export function rowIdOf(recordId: string): string | null {
  const id = recordId.startsWith(TEMPLATE_PREFIX) ? recordId.slice(TEMPLATE_PREFIX.length) : "";
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function recordToInsert(record: RunRecord): TemplateInsert {
  return {
    name: record.name?.trim() || null,
    surface: record.surface,
    model_id: record.modelId,
    model_label: record.modelLabel,
    prompt: record.prompt,
    settings: record.settings ?? {},
    inputs: (record.inputs ?? []).filter((input) => ROLES.has(input.role) && typeof input.url === "string"),
    urls: record.urls.filter((url) => typeof url === "string"),
    ratio: record.ratio,
    meta: record.meta,
    badge: record.badge ?? null,
    favorite: record.favorite === true,
  };
}

export function rowToRecord(row: TemplateRow, art: (surface: Surface, id: string) => string): RunRecord {
  const id = templateId(row.id);
  return {
    id,
    name: row.name ?? undefined,
    surface: row.surface,
    kind: row.surface,
    modelId: row.model_id,
    modelLabel: row.model_label,
    prompt: row.prompt,
    ratio: row.ratio,
    meta: row.meta,
    badge: row.badge ?? undefined,
    urls: Array.isArray(row.urls) ? row.urls : [],
    status: "completed",
    art: art(row.surface, id),
    createdAt: Date.parse(row.created_at) || Date.now(),
    favorite: row.favorite,
    settings: row.settings ?? {},
    inputs: Array.isArray(row.inputs) && row.inputs.length > 0 ? row.inputs : undefined,
  };
}

/** Validates a patch from the browser before it reaches the database. */
export function cleanPatch(patch: unknown): TemplatePatch {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Nothing to change");
  const input = patch as Record<string, unknown>;
  const out: TemplatePatch = {};
  if ("name" in input) {
    if (input.name !== null && typeof input.name !== "string") throw new Error("Name must be text");
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
    out.name = name || null;
  }
  if ("prompt" in input) {
    if (typeof input.prompt !== "string") throw new Error("Prompt must be text");
    out.prompt = input.prompt.slice(0, 20_000);
  }
  if ("favorite" in input) {
    if (typeof input.favorite !== "boolean") throw new Error("Favorite must be true or false");
    out.favorite = input.favorite;
  }
  if (Object.keys(out).length === 0) throw new Error("Nothing to change");
  return out;
}

export function cleanInsert(value: unknown): TemplateInsert {
  if (value === null || typeof value !== "object") throw new Error("Invalid template");
  const row = value as Partial<TemplateInsert>;
  if (row.surface !== "image" && row.surface !== "video") throw new Error("Invalid template surface");
  if (typeof row.model_id !== "string" || !row.model_id) throw new Error("Template needs a model");
  return {
    name: typeof row.name === "string" ? row.name.trim().slice(0, 120) || null : null,
    surface: row.surface,
    model_id: row.model_id.slice(0, 200),
    model_label: typeof row.model_label === "string" ? row.model_label.slice(0, 200) : row.model_id,
    prompt: typeof row.prompt === "string" ? row.prompt.slice(0, 20_000) : "",
    settings: row.settings && typeof row.settings === "object" && !Array.isArray(row.settings) ? row.settings : {},
    inputs: Array.isArray(row.inputs)
      ? row.inputs.filter((input) => input && ROLES.has(input.role) && typeof input.url === "string").slice(0, 40)
      : [],
    urls: Array.isArray(row.urls) ? row.urls.filter((url) => typeof url === "string").slice(0, 8) : [],
    ratio: typeof row.ratio === "string" ? row.ratio.slice(0, 20) : "1 / 1",
    meta: typeof row.meta === "string" ? row.meta.slice(0, 300) : "",
    badge: typeof row.badge === "string" ? row.badge.slice(0, 40) : null,
    favorite: row.favorite === true,
  };
}

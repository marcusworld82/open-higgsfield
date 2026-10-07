"use server";

import { requireOwner } from "@/lib/supabase/server";

import { toFailure } from "@/generation/failure";
import type { ActionResult } from "@/generation/result";

import { cleanInsert, cleanPatch, type TemplateRow } from "./template-rows";

/* Templates saved to Supabase, one row per template in public.ohf_templates.
   Every query runs as the signed-in owner, so RLS is what keeps rows private. */

const TABLE = "ohf_templates";
const COLUMNS =
  "id, name, surface, model_id, model_label, prompt, settings, inputs, urls, ratio, meta, badge, favorite, created_at";
const MAX_TEMPLATES = 200;

export async function listTemplates(): Promise<ActionResult<TemplateRow[]>> {
  try {
    const { supabase } = await requireOwner();
    const { data, error } = await supabase
      .from(TABLE)
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(MAX_TEMPLATES);
    if (error) throw new Error(`Could not load templates (${error.message})`);
    return { ok: true, value: (data ?? []) as TemplateRow[] };
  } catch (caught) {
    return toFailure(caught, "templates");
  }
}

/** Saves one or more templates. More than one is the first sign-in bringing
    over templates this browser kept before sign-in existed. */
export async function createTemplates(rows: unknown): Promise<ActionResult<TemplateRow[]>> {
  try {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("Nothing to save");
    const clean = rows.slice(0, MAX_TEMPLATES).map(cleanInsert);
    const { supabase, user } = await requireOwner();
    const { data, error } = await supabase
      .from(TABLE)
      .insert(clean.map((row) => ({ ...row, user_id: user.id })))
      .select(COLUMNS);
    if (error) throw new Error(`Could not save the template (${error.message})`);
    return { ok: true, value: (data ?? []) as TemplateRow[] };
  } catch (caught) {
    return toFailure(caught, "templates");
  }
}

export async function updateTemplate(id: unknown, patch: unknown): Promise<ActionResult<TemplateRow>> {
  try {
    const rowId = cleanId(id);
    const changes = cleanPatch(patch);
    const { supabase } = await requireOwner();
    const { data, error } = await supabase.from(TABLE).update(changes).eq("id", rowId).select(COLUMNS).maybeSingle();
    if (error) throw new Error(`Could not update the template (${error.message})`);
    if (!data) throw new Error("That template no longer exists");
    return { ok: true, value: data as TemplateRow };
  } catch (caught) {
    return toFailure(caught, "templates");
  }
}

export async function deleteTemplate(id: unknown): Promise<ActionResult<null>> {
  try {
    const rowId = cleanId(id);
    const { supabase } = await requireOwner();
    const { error } = await supabase.from(TABLE).delete().eq("id", rowId);
    if (error) throw new Error(`Could not delete the template (${error.message})`);
    return { ok: true, value: null };
  } catch (caught) {
    return toFailure(caught, "templates");
  }
}

function cleanId(id: unknown): string {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid template id");
  return id;
}

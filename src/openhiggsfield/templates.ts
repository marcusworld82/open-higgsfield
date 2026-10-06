import { defaultKv, type Kv } from "./idb";
import type { RunRecord } from "./history";

export const TEMPLATES_KEY = "templates.v1";
const MAX_TEMPLATES = 80;

export async function loadTemplates(kv: Kv = defaultKv()): Promise<RunRecord[]> {
  try {
    const stored = await kv.get<unknown>(TEMPLATES_KEY);
    if (!Array.isArray(stored)) return [];
    return stored.filter(isTemplate).slice(0, MAX_TEMPLATES);
  } catch {
    return [];
  }
}

export async function saveTemplates(records: RunRecord[], kv: Kv = defaultKv()): Promise<void> {
  try {
    await kv.set(TEMPLATES_KEY, records.filter(isTemplate).slice(0, MAX_TEMPLATES));
  } catch {
    /* private mode or a denied store */
  }
}

export function templateFrom(record: RunRecord): RunRecord {
  return {
    ...record,
    id: `template-${crypto.randomUUID()}`,
    status: "completed",
    favorite: false,
    error: undefined,
    requestId: undefined,
    createdAt: Date.now(),
  };
}

function isTemplate(value: unknown): value is RunRecord {
  if (value === null || typeof value !== "object") return false;
  const record = value as Partial<RunRecord>;
  return (
    typeof record.id === "string" &&
    (record.surface === "image" || record.surface === "video") &&
    typeof record.prompt === "string" &&
    typeof record.modelId === "string" &&
    Array.isArray(record.urls) &&
    record.status === "completed"
  );
}

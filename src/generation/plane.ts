import { getModel, parseSettings } from "./catalog";
import type { GenerationPlane, PlaneExtras, Shot } from "./catalog/types";
import { roleLimits } from "@/openhiggsfield/data";
import { useActive } from "./stores/active";
import { useImageMedia, useVideoMedia } from "./stores/media";
import { useImagePrompt, useVideoPrompt } from "./stores/prompt";
import { useSettings } from "./stores/settings";

export function assemblePlane(): GenerationPlane {
  const { model: modelId, surface } = useActive.getState();
  const model = getModel(modelId);
  const text = (surface === "image" ? useImagePrompt : useVideoPrompt).getState().text;
  const items = (surface === "image" ? useImageMedia : useVideoMedia).getState().items;
  const raw = useSettings.getState().byModel[model.id] ?? {};
  const limits = roleLimits(model, raw);
  const media: GenerationPlane["media"] = {};
  for (const item of items) {
    const max = limits[item.role];
    if (!max) continue;
    const list = media[item.role] ?? [];
    if (list.length >= max) continue;
    list.push(item);
    media[item.role] = list;
  }
  return {
    model: model.id,
    prompt: { text },
    media,
    settings: parseSettings(model, raw),
    extras: extrasOf(raw),
  };
}

/** The non-catalog inputs ride in the same per-model settings record, so they
    persist and reuse the way every other dial does. */
export function extrasOf(raw: Record<string, unknown>): PlaneExtras {
  const extras: PlaneExtras = {};
  if (typeof raw.presetId === "string" && raw.presetId) extras.presetId = raw.presetId;
  if (Array.isArray(raw.shots)) extras.shots = shotsFrom(raw.shots);
  return extras;
}

export function shotsFrom(value: unknown): Shot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((shot) => {
    if (shot === null || typeof shot !== "object") return [];
    const { prompt, duration } = shot as Record<string, unknown>;
    return typeof prompt === "string" && typeof duration === "number" ? [{ prompt, duration }] : [];
  });
}

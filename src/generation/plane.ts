import { getModel, parseSettings } from "./catalog";
import type { GenerationPlane } from "./catalog/types";
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
  };
}

import type { ModelEntry } from "./types";

/** Turbo image-to-video. Standard and Pro take a start frame only — no end frame. Pro can also run from text. */
export const kling25: ModelEntry = {
  id: "kling-2.5",
  surface: "video",
  label: "Kling 2.5 Turbo",
  roles: { start: 1 },
  settings: {
    tier: { type: "enum", values: ["standard", "pro"], default: "pro" },
    duration: { type: "enum", values: ["5", "10"], default: "5" },
    cfgScale: { type: "range", min: 0, max: 1, default: 0.5, step: 0.01 },
  },
};
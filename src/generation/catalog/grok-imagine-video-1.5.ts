import type { ModelEntry } from "./types";

export const grokImagineVideo15: ModelEntry = {
  id: "grok-imagine-video-1.5",
  surface: "video",
  label: "Grok Imagine Video 1.5",
  roles: { start: 1, reference: 8, audio: 1 },
  settings: {
    aspectRatio: { type: "enum", values: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"], default: "auto" },
    resolution: { type: "enum", values: ["480p", "720p", "1080p"], default: "720p" },
    duration: { type: "range", min: 1, max: 15, default: 5 },
  },
  routes: {
    default: {
      path: "xai/grok-imagine-video/v1.5/reference-to-video",
      shape: "reference",
      audio: "audio_url",
      fields: ["duration", "resolution", "aspect"],
    },
  },
};
import type { ModelEntry } from "./types";

const aspect = ["auto", "adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;
const fields = ["duration", "resolution", "aspect", "watermark"] as const;

export const minimaxH3: ModelEntry = {
  id: "minimax-h3",
  surface: "video",
  label: "MiniMax H3",
  roles: { start: 1, end: 1 },
  modeRoles: {
    text: {},
    image: { start: 1, end: 1 },
    reference: { reference: 8, video: 3, audio: 3 },
  },
  settings: {
    mode: { type: "enum", values: ["text", "image", "reference"], default: "image" },
    aspectRatio: { type: "enum", values: aspect, default: "16:9" },
    resolution: { type: "enum", values: ["2K"], default: "2K" },
    duration: { type: "range", min: 5, max: 15, default: 5 },
    aigcWatermark: { type: "boolean", default: false },
  },
  routes: {
    text: { path: "minimax/h3/text-to-video", shape: "text", fields },
    image: { path: "minimax/h3/image-to-video", shape: "image", endKey: "end_image_url", fields },
    reference: {
      path: "minimax/h3/reference-to-video",
      shape: "reference",
      audio: "audio_urls",
      fields,
    },
  },
};
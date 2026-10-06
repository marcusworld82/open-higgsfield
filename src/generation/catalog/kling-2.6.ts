import type { ModelEntry } from "./types";

const fields = ["duration", "aspect", "sound", "cfg"] as const;

/** Pro text or a single start frame. This version has no end frame. */
export const kling26: ModelEntry = {
  id: "kling-2.6",
  surface: "video",
  label: "Kling 2.6 Pro",
  roles: { start: 1 },
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1"], default: "16:9" },
    duration: { type: "enum", values: ["5", "10"], default: "5" },
    sound: { type: "boolean", default: true },
    cfgScale: { type: "range", min: 0, max: 1, default: 0.5, step: 0.01 },
  },
  routes: {
    text: { path: "kling-video/v2.6/pro/text-to-video", shape: "text", fields },
    image: { path: "kling-video/v2.6/pro/image-to-video", shape: "image", fields },
  },
};
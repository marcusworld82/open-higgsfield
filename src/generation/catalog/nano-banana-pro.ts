import type { ModelEntry } from "./types";

/** Google Gemini 3 Pro Image, branded Nano Banana Pro. */
export const nanoBananaPro: ModelEntry = {
  id: "nano-banana-pro",
  surface: "image",
  label: "Nano Banana Pro",
  provider: "google",
  roles: { reference: 8 },
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
      default: "1:1",
    },
    resolution: { type: "enum", values: ["1k", "2k", "4k"], default: "1k" },
  },
};

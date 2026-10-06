import type { ModelEntry } from "./types";

export const grokImagine2: ModelEntry = {
  id: "grok-imagine-2",
  surface: "image",
  label: "Grok Imagine 2.0",
  roles: { reference: 8 },
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["auto", "1:1", "1:2", "2:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"],
      default: "1:1",
    },
    resolution: { type: "enum", values: ["1k", "2k"], default: "1k" },
    quality: { type: "enum", values: ["low", "medium"], default: "medium" },
  },
  routes: {
    default: {
      path: "xai/grok-imagine-image-2.0",
      shape: "reference",
      fields: ["resolution", "aspect", "quality"],
    },
  },
};
import type { ModelEntry } from "./types";

export const recraft41: ModelEntry = {
  id: "recraft-4.1",
  surface: "image",
  label: "Recraft 4.1",
  roles: {},
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["1:1", "2:1", "1:2", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "6:10", "14:10", "10:14", "16:9", "9:16"],
      default: "1:1",
    },
    resolution: { type: "enum", values: ["1k"], default: "1k" },
    outputFormat: { type: "enum", values: ["png", "jpg", "webp"], default: "png" },
  },
  routes: {
    default: {
      path: "recraft/v4.1/text-to-image",
      shape: "text",
      fields: ["aspect", "format", "resolution"],
    },
  },
};
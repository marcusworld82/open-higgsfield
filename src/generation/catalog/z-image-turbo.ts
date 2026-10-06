import type { ModelEntry } from "./types";

export const zImageTurbo: ModelEntry = {
  id: "z-image-turbo",
  surface: "image",
  label: "Z-Image Turbo",
  roles: {},
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["1:1", "2:3", "3:2", "3:4", "4:3", "7:9", "9:7", "9:16", "16:9", "21:9"],
      default: "1:1",
    },
    resolution: { type: "enum", values: ["1k", "2k"], default: "1k" },
    promptExtend: { type: "boolean", default: false },
  },
  routes: {
    default: {
      path: "z-image/turbo",
      shape: "text",
      fields: ["aspect", "resolution", "extend"],
    },
  },
};
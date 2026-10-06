import type { ModelEntry } from "./types";

const aspect = ["1:1", "2:3", "3:2", "3:4", "4:3", "7:9", "9:7", "9:16", "16:9", "21:9"] as const;
const fields = ["resolution", "aspect", "extend", "thinking"] as const;

export const qwenImage3: ModelEntry = {
  id: "qwen-image-3",
  surface: "image",
  label: "Qwen Image 3",
  roles: {},
  modeRoles: {
    text: {},
    edit: { reference: 4 },
  },
  settings: {
    mode: { type: "enum", values: ["text", "edit"], default: "text" },
    aspectRatio: { type: "enum", values: aspect, default: "1:1" },
    resolution: { type: "enum", values: ["1k", "2k"], default: "1k" },
    promptExtend: { type: "boolean", default: false },
    enableThinking: { type: "boolean", default: false },
  },
  routes: {
    text: { path: "alibaba/qwen-image-3/text-to-image", shape: "text", fields },
    edit: { path: "alibaba/qwen-image-3/edit", shape: "reference", fields },
  },
};
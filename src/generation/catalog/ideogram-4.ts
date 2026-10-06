import type { ModelEntry } from "./types";

const aspect = [
  "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "1:2", "2:1",
  "5:8", "8:5", "9:22", "22:9", "9:23", "23:9", "3:8", "8:3", "5:12", "12:5", "1:3", "3:1",
] as const;

export const ideogram4: ModelEntry = {
  id: "ideogram-4",
  surface: "image",
  label: "Ideogram 4.0",
  roles: { start: 1 },
  settings: {
    aspectRatio: { type: "enum", values: aspect, default: "1:1" },
    renderingSpeed: { type: "enum", values: ["TURBO", "DEFAULT", "QUALITY"], default: "DEFAULT" },
    imageWeight: { type: "range", min: 1, max: 100, default: 50 },
  },
  routes: {
    text: { path: "ideogram/v4.0", shape: "text", fields: ["aspect", "rendering"] },
    image: { path: "ideogram/v4.0", shape: "image", fields: ["aspect", "rendering", "weight"] },
  },
};
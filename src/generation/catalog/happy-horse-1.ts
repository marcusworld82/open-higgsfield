import type { ModelEntry } from "./types";

const fields = ["duration", "resolution"] as const;

export const happyHorse1: ModelEntry = {
  id: "happy-horse-1",
  surface: "video",
  label: "Happy Horse 1.0",
  roles: { start: 1 },
  modeRoles: {
    text: {},
    image: { start: 1 },
    reference: { reference: 8 },
  },
  settings: {
    mode: { type: "enum", values: ["text", "image", "reference"], default: "image" },
    resolution: { type: "enum", values: ["720p", "1080p"], default: "1080p" },
    duration: { type: "range", min: 2, max: 15, default: 5 },
  },
  routes: {
    text: { path: "alibaba/happy-horse/text-to-video", shape: "text", fields },
    image: { path: "alibaba/happy-horse/image-to-video", shape: "image", fields },
    reference: { path: "alibaba/happy-horse/reference-to-video", shape: "reference", fields },
  },
};
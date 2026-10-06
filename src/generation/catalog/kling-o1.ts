import type { ModelEntry } from "./types";

/** Omni is the same four jobs as O3, without 4K and without sound on the frame endpoint. */
export const klingO1: ModelEntry = {
  id: "kling-o1",
  surface: "video",
  label: "Kling O1 (Omni)",
  roles: { start: 1, end: 1 },
  modeRoles: {
    "first-last": { start: 1, end: 1 },
    "image-reference": { reference: 8 },
    "video-edit": { video: 1, reference: 4 },
    "video-reference": { video: 3, reference: 8 },
  },
  settings: {
    mode: {
      type: "enum",
      values: ["first-last", "image-reference", "video-edit", "video-reference"],
      default: "first-last",
    },
    tier: { type: "enum", values: ["std", "pro"], default: "pro" },
    aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1"], default: "16:9" },
    duration: { type: "enum", values: ["5", "10"], default: "5" },
  },
  routes: {
    "first-last": {
      path: "kling-video/omni/first-last-frame",
      shape: "frames",
      fields: ["duration", "aspect", "tier"],
    },
    "image-reference": {
      path: "kling-video/omni/image-reference",
      shape: "reference",
      fields: ["duration", "aspect", "tier"],
    },
    "video-edit": {
      path: "kling-video/omni/video-edit",
      shape: "reference",
      fields: ["tier"],
    },
    "video-reference": {
      path: "kling-video/omni/video-reference",
      shape: "reference",
      fields: ["duration", "aspect", "tier"],
    },
  },
};
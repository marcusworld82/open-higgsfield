import type { ModelEntry } from "./types";

const aspect = { type: "enum", values: ["16:9", "9:16", "1:1"], default: "16:9" } as const;

/** O3 is four endpoints: start/end frames, image references, video edit, and video reference. */
export const klingO3: ModelEntry = {
  id: "kling-o3",
  surface: "video",
  label: "Kling O3",
  roles: { start: 1, end: 1 },
  modeRoles: {
    "first-last": { start: 1, end: 1 },
    "image-reference": { start: 1, end: 1, reference: 8 },
    "video-edit": { video: 1, reference: 4 },
    "video-reference": { video: 3, reference: 8 },
  },
  settings: {
    mode: {
      type: "enum",
      values: ["first-last", "image-reference", "video-edit", "video-reference"],
      default: "first-last",
    },
    tier: { type: "enum", values: ["std", "pro", "4k"], default: "pro" },
    aspectRatio: aspect,
    duration: { type: "range", min: 3, max: 15, default: 5 },
    sound: { type: "boolean", default: true },
    multiShots: { type: "boolean", default: false },
    shotType: { type: "enum", values: ["customize", "intelligent"], default: "customize" },
  },
  routes: {
    "first-last": {
      path: "kling-video/o3/first-last-frame",
      shape: "frames",
      fields: ["duration", "aspect", "sound", "tier", "multi"],
    },
    "image-reference": {
      path: "kling-video/o3/image-reference",
      shape: "reference",
      frames: true,
      fields: ["duration", "aspect", "sound", "tier", "multi", "shot"],
    },
    "video-edit": {
      path: "kling-video/o3/video-edit",
      shape: "reference",
      fields: ["tier"],
    },
    "video-reference": {
      path: "kling-video/o3/video-reference",
      shape: "reference",
      maxDuration: 10,
      maxTier: "pro",
      fields: ["duration", "aspect", "tier"],
    },
  },
};
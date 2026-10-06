import type { ModelEntry } from "./types";

const aspect = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;

/** Image mode takes a start and an end frame. Reference mode takes images plus clips, like Genjutsu. */
export const wan27: ModelEntry = {
  id: "wan-2.7",
  surface: "video",
  label: "Wan 2.7",
  roles: { start: 1, end: 1 },
  modeRoles: {
    text: { audio: 1 },
    image: { start: 1, end: 1, audio: 1 },
    reference: { reference: 8, video: 3 },
  },
  settings: {
    mode: { type: "enum", values: ["text", "image", "reference"], default: "image" },
    aspectRatio: { type: "enum", values: aspect, default: "16:9" },
    resolution: { type: "enum", values: ["720p", "1080p"], default: "1080p" },
    duration: { type: "range", min: 2, max: 15, default: 5 },
    promptExtend: { type: "boolean", default: false },
  },
  routes: {
    text: {
      path: "wan/v2.7/text-to-video",
      shape: "text",
      audio: "audio_url",
      fields: ["duration", "resolution", "aspect", "extend"],
    },
    image: {
      path: "wan/v2.7/image-to-video",
      shape: "image",
      endKey: "end_image_url",
      audio: "audio_url",
      fields: ["duration", "resolution", "extend"],
    },
    reference: {
      path: "wan/v2.7/reference-to-video",
      shape: "reference",
      maxDuration: 10,
      fields: ["duration", "resolution", "aspect", "extend"],
    },
  },
};
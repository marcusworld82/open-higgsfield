import type { ModelEntry } from "./types";

/** Reference mode is video-only. The image endpoint takes a start frame, not an end frame. */
export const wan26: ModelEntry = {
  id: "wan-2.6",
  surface: "video",
  label: "Wan 2.6",
  roles: { start: 1 },
  modeRoles: {
    text: { audio: 1 },
    image: { start: 1, audio: 1 },
    reference: { video: 3 },
  },
  settings: {
    mode: { type: "enum", values: ["text", "image", "reference"], default: "image" },
    aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1", "4:3", "3:4"], default: "16:9" },
    resolution: { type: "enum", values: ["720p", "1080p"], default: "1080p" },
    duration: { type: "enum", values: ["5", "10", "15"], default: "5" },
    promptExtend: { type: "boolean", default: false },
    multiShots: { type: "boolean", default: false },
  },
  routes: {
    text: {
      path: "wan/v2.6/text-to-video",
      shape: "text",
      audio: "audio_url",
      fields: ["duration", "resolution", "extend", "multi"],
    },
    image: {
      path: "wan/v2.6/image-to-video",
      shape: "image",
      audio: "audio_url",
      fields: ["duration", "resolution", "extend", "multi"],
    },
    reference: {
      path: "wan/v2.6/reference-to-video",
      shape: "reference",
      maxDuration: 10,
      fields: ["duration", "resolution", "aspect"],
    },
  },
};
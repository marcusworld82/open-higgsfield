import type { ModelEntry } from "./types";

/** Image-to-video takes a start frame and an end frame. Text-to-video takes the aspect ratio instead. */
export const pixverse6: ModelEntry = {
  id: "pixverse-6",
  surface: "video",
  label: "PixVerse 6",
  roles: { start: 1, end: 1 },
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "4:3", "1:1", "3:4", "9:16"], default: "16:9" },
    resolution: { type: "enum", values: ["360p", "540p", "720p", "1080p"], default: "720p" },
    duration: { type: "range", min: 1, max: 15, default: 5 },
    generateAudio: { type: "boolean", default: true },
  },
  routes: {
    text: {
      path: "pixverse/v6/text-to-video",
      shape: "text",
      fields: ["duration", "resolution", "aspect", "audioFlag"],
    },
    image: {
      path: "pixverse/v6/image-to-video",
      shape: "image",
      endKey: "end_image_url",
      fields: ["duration", "resolution", "audioFlag"],
    },
  },
};
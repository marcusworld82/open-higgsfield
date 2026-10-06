import type { ModelEntry } from "./types";

/** Start frame only. Durations are 6 or 10 seconds. */
export const minimaxHailuo23: ModelEntry = {
  id: "minimax-hailuo-2.3",
  surface: "video",
  label: "MiniMax Hailuo 2.3",
  roles: { start: 1 },
  settings: {
    duration: { type: "enum", values: ["6", "10"], default: "6" },
    promptOptimizer: { type: "boolean", default: true },
  },
  routes: {
    text: {
      path: "minimax/hailuo-2.3/standard/text-to-video",
      shape: "text",
      fields: ["duration", "optimizer"],
    },
    image: {
      path: "minimax/hailuo-2.3/standard/image-to-video",
      shape: "image",
      fields: ["duration", "optimizer"],
    },
  },
};
import type { ModelEntry } from "./types";

/** Higgsfield Genjutsu. Motion transfer and object swap share one body; restyle adds a preset. */
export const genjutsu: ModelEntry = {
  id: "genjutsu",
  surface: "video",
  label: "Genjutsu",
  provider: "higgsfield",
  roles: { video: 1, reference: 8 },
  settings: {
    mode: {
      type: "enum",
      values: ["motion-transfer", "object-swap", "restyle"],
      default: "motion-transfer",
    },
    resolution: { type: "enum", values: ["720p", "480p", "1080p"], default: "720p" },
  },
};

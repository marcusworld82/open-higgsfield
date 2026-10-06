import type { ModelEntry } from "./types";

/** Motion transfer and object swap take a source video plus 1–8 references.
 *  Restyle takes the video, a style preset, and up to 5 optional references. */
export const genjutsu: ModelEntry = {
  id: "genjutsu",
  surface: "video",
  label: "Genjutsu",
  provider: "higgsfield",
  roles: { video: 1, reference: 8 },
  modeRoles: {
    "motion-transfer": { video: 1, reference: 8 },
    "object-swap": { video: 1, reference: 8 },
    restyle: { video: 1, reference: 5 },
  },
  settings: {
    mode: {
      type: "enum",
      values: ["motion-transfer", "object-swap", "restyle"],
      default: "motion-transfer",
    },
    resolution: { type: "enum", values: ["720p", "480p", "1080p"], default: "720p" },
  },
};
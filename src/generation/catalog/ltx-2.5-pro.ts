import type { ModelEntry, ModelRoute } from "./types";

const fields = ["duration", "resolution", "aspect", "audioFlag", "fps", "camera"] as const;
const settings = {
  aspectRatio: { type: "enum", values: ["16:9", "9:16"], default: "16:9" },
  resolution: { type: "enum", values: ["720p", "1080p"], default: "1080p" },
  duration: { type: "enum", values: ["6", "8", "10"], default: "6" },
  fps: { type: "enum", values: ["24", "25", "50"], default: "24" },
  generateAudio: { type: "boolean", default: true },
  cameraMovement: {
    type: "enum",
    values: ["static", "dolly_in", "dolly_out", "dolly_left", "dolly_right", "jib_up", "jib_down", "focus_shift"],
    default: "static",
  },
} as const satisfies ModelEntry["settings"];

function ltx(id: string, label: string, kind: "pro" | "fast"): ModelEntry {
  const image: ModelRoute = {
    path: `lightricks/ltx-2.5/image-to-video/${kind}`,
    shape: "image",
    endKey: "end_image_url",
    fields,
  };
  return {
    id,
    surface: "video",
    label,
    roles: { start: 1, end: 1 },
    settings,
    routes: {
      text: { path: `lightricks/ltx-2.5/text-to-video/${kind}`, shape: "text", fields },
      image,
    },
  };
}

export const ltx25Pro = ltx("ltx-2.5-pro", "LTX 2.5 Pro", "pro");
export const ltx25Fast = ltx("ltx-2.5-fast", "LTX 2.5 Fast", "fast");
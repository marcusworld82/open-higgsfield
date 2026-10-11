import type { ModelEntry, ModelRoute } from "./types";

const fields = ["duration", "resolution", "aspect", "audioFlag", "thinking"] as const;
/* "adaptive" is the API default: the frame follows the inputs. The studio shows it as Auto. */
const aspect = ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4"] as const;

function buildWan3(id: string, label: string, prefix: string): ModelEntry {
  const route = (suffix: string, shape: ModelRoute["shape"], extra?: Partial<ModelRoute>): ModelRoute => ({
    path: `${prefix}/${suffix}`,
    shape,
    endKey: "end_image_url",
    audio: "audio_urls",
    fields,
    ...extra,
  });
  return {
    id,
    surface: "video",
    label,
    roles: { start: 1, end: 1 },
    modeRoles: {
      text: {},
      image: { start: 1, end: 1 },
      reference: { reference: 10, video: 5, audio: 5 },
    },
    settings: {
      mode: { type: "enum", values: ["text", "image", "reference"], default: "image" },
      aspectRatio: { type: "enum", values: aspect, default: "adaptive" },
      resolution: { type: "enum", values: ["480p", "720p", "1080p"], default: "1080p" },
      duration: { type: "range", min: 2, max: 30, default: 5 },
      generateAudio: { type: "boolean", default: true },
      enableThinking: { type: "boolean", default: false },
    },
    routes: {
      text: route("text-to-video", "text"),
      image: route("image-to-video", "image"),
      reference: route("reference-to-video", "reference"),
    },
  };
}

export const wan3 = buildWan3("wan-3", "Wan 3.0", "alibaba/wan-3.0");
export const wan3Prime = buildWan3("wan-3-prime", "Wan 3.0 Prime", "alibaba/wan-3.0-prime");
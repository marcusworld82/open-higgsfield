import type { ModelEntry } from "./types";

/** OpenAI GPT Image 2.5. Flare is the fast everyday model; Sunburst is the precision model. */
export const gptImage25: ModelEntry = {
  id: "gpt-image-2.5",
  surface: "image",
  label: "GPT Image 2.5",
  provider: "openai",
  roles: { reference: 4 },
  settings: {
    variant: { type: "enum", values: ["flare", "sunburst"], default: "flare" },
    quality: { type: "enum", values: ["low", "medium", "high"], default: "high" },
    aspectRatio: { type: "enum", values: ["1:1", "16:9", "9:16", "4:3", "3:4"], default: "1:1" },
  },
};

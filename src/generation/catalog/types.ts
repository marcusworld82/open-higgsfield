export type Surface = "image" | "video";
export type MediaRole = "start" | "end" | "reference" | "video" | "audio";
export type ProviderId = "higgsfield" | "openai" | "google";

export type MediaItem = {
  id: string;
  url: string;
  role: MediaRole;
  /** A still grabbed from a video file at upload, so the strip is not a blank tile. */
  poster?: string;
};

export type SettingField =
  | { type: "enum"; values: readonly string[]; default: string }
  | { type: "range"; min: number; max: number; default: number; step?: number }
  | { type: "boolean"; default: boolean };

export type PlatformPaths = {
  text?: string;
  image?: string;
  firstLast?: string;
  reference?: string;
};

export type RouteShape = "text" | "image" | "frames" | "reference" | "source" | "motion";

export type ModelRoute = {
  path: string;
  shape: RouteShape;
  endKey?: "last_image_url" | "end_image_url" | "last_frame_url";
  /** Send start/end as first_frame_url and last_frame_url alongside reference media. */
  frames?: boolean;
  audio?: "audio_url" | "audio_urls";
  /** Settings this endpoint accepts. Anything else is left off the body. */
  fields: readonly string[];
  maxDuration?: number;
  /** Kling video-reference rejects 4k. */
  maxTier?: "pro";
};

export type ModelEntry = {
  id: string;
  surface: Surface;
  label: string;
  roles: Partial<Record<MediaRole, number>>;
  /** Media slots that replace `roles` while this mode is selected. */
  modeRoles?: Record<string, Partial<Record<MediaRole, number>>>;
  settings: Record<string, SettingField>;
  /** Submit paths when the shared mapper is enough. Soul, Kling 3, and Seedance keep custom maps. */
  paths?: PlatformPaths;
  /** One route per mode value. `text` and `image` are also used when there is no mode control. */
  routes?: Record<string, ModelRoute>;
  /** Defaults to Higgsfield. OpenAI and Google use the keys saved for those providers. */
  provider?: ProviderId;
};

/** One custom shot of a multi-shot video: its own prompt and length. */
export type Shot = { prompt: string; duration: number };

/** Inputs that are not a catalog setting: a value picked from a live list
    (Genjutsu's restyle presets) or a structure (multi-shot prompts). */
export type PlaneExtras = {
  /** Genjutsu restyle style id, from the account's presets list. */
  presetId?: string;
  /** Kling multi-shot custom shots, sent as multi_prompt. */
  shots?: Shot[];
};

export type GenerationPlane = {
  model: string;
  prompt: { text: string };
  media: Partial<Record<MediaRole, MediaItem[]>>;
  settings: Record<string, unknown>;
  extras?: PlaneExtras;
};

import type { MediaRole, ModelEntry, PlaneExtras } from "./catalog/types";
import { roleLimits } from "@/openhiggsfield/data";

/* What a model needs before a press can reach the platform, and which of its
   inputs only make sense together. The mappers in to-platform.ts are the
   authority; these mirror them so the panel can say so before the request. */

const KLING3_SHOTS = new Set(["kling-3-std", "kling-3-pro", "kling-3-4k"]);
const O3_SHOT_MODES = new Set(["first-last", "image-reference"]);

/** Models whose image-to-video endpoint has no aspect field: the start frame
    sets the frame. */
const ASPECT_FROM_START = new Set([
  "kling-3-turbo",
  "kling-3-std",
  "kling-3-pro",
  "kling-3-4k",
  "seedance-2",
  "seedance-2-fast",
  "seedance-2-mini",
  "seedance-2.5",
]);

function modeOf(model: ModelEntry, settings: Record<string, unknown>): string {
  const field = model.settings.mode;
  if (field?.type !== "enum") return "";
  const raw = settings.mode;
  return typeof raw === "string" && field.values.includes(raw) ? raw : field.default;
}

/** True for the text / image / reference trio (Wan, Happy Horse, MiniMax H3):
    the panel shows it as two tabs, Frames and References, and an empty Frames
    tab is a text-to-video run. */
export function framesAndReferences(model: ModelEntry): boolean {
  const field = model.settings.mode;
  return (
    field?.type === "enum" &&
    field.values.length === 3 &&
    ["text", "image", "reference"].every((value) => field.values.includes(value))
  );
}

export function requiredRoles(model: ModelEntry, settings: Record<string, unknown>): MediaRole[] {
  const mode = modeOf(model, settings);
  if (model.id === "genjutsu") return mode === "restyle" ? ["video"] : ["video", "reference"];
  if (model.id.startsWith("kling-3-motion")) return ["start", "video"];
  if (model.id === "seedance-2.5-edit" || model.id === "seedance-2.5-extend") return ["video"];
  if (model.id === "kling-2.5" && settings.tier === "standard") return ["start"];
  const routes = model.routes;
  if (!routes) return [];
  const route = (mode && routes[mode]) || routes.image || routes.text;
  if (!route) return [];
  if (route.shape === "source") return ["video"];
  if (route.shape === "motion") return ["start", "video"];
  if ((route.shape === "image" || route.shape === "frames") && (!routes.text || mode === "first-last")) {
    return ["start"];
  }
  return [];
}

/** An end frame rides on a start frame everywhere except the first/last
    endpoints, which take either frame alone. */
export function endNeedsStart(model: ModelEntry, settings: Record<string, unknown>): boolean {
  const mode = modeOf(model, settings);
  const route = model.routes?.[mode];
  if (route?.shape === "frames") return false;
  if (!model.routes && model.paths?.firstLast) return false;
  return true;
}

export type ShotSupport = {
  /** Custom shots are optional (Kling 3.0) or required once multi-shot is on (Kling O3). */
  required: boolean;
  min: number;
  max: number;
};

/** Multi-shot with per-shot prompts (multi_prompt), where the API documents it. */
export function shotSupport(model: ModelEntry, settings: Record<string, unknown>): ShotSupport | null {
  if (KLING3_SHOTS.has(model.id)) return { required: false, min: 3, max: 15 };
  if (model.id === "kling-o3" && O3_SHOT_MODES.has(modeOf(model, settings))) {
    return { required: true, min: 3, max: 15 };
  }
  return null;
}

/** Whether the current mode's request carries reference media the prompt can
    point at — the @ menu offers them as Image 1, Video 1, Audio 1. */
export function taggableRoles(model: ModelEntry, settings: Record<string, unknown>): MediaRole[] {
  const limits = roleLimits(model, settings);
  /* Genjutsu's one video is the source, not something the prompt names. */
  const roles = model.id === "genjutsu" ? (["reference"] as const) : (["reference", "video", "audio"] as const);
  return roles.filter((role) => (limits[role] ?? 0) > 0);
}

export function aspectFollowsStart(model: ModelEntry): boolean {
  return ASPECT_FROM_START.has(model.id);
}

const NEEDS: Record<MediaRole, string> = {
  start: "Add a start frame",
  end: "Add an end frame",
  reference: "Add at least one reference image",
  video: "Add a video",
  audio: "Add an audio track",
};

/** The first thing stopping a press, in the words the button's hint uses, or
    null when the plane can go. */
export function blocker(
  model: ModelEntry,
  settings: Record<string, unknown>,
  counts: Partial<Record<MediaRole, number>>,
  prompt: string,
  extras: PlaneExtras,
): string | null {
  const mode = modeOf(model, settings);
  for (const role of requiredRoles(model, settings)) {
    if ((counts[role] ?? 0) > 0) continue;
    if (model.id === "genjutsu") {
      if (role === "video") return "Add a reference video";
      return mode === "object-swap" ? "Add an object or product image" : "Add a character image";
    }
    return NEEDS[role];
  }
  if ((counts.end ?? 0) > 0 && !(counts.start ?? 0) && endNeedsStart(model, settings)) {
    return "Add a start frame to use the end frame";
  }
  if (model.id === "genjutsu") {
    if (mode === "restyle" && !extras.presetId) return "Pick a style";
    return null;
  }
  if (!prompt.trim()) return "Write a prompt first";
  const shots = shotSupport(model, settings);
  if (shots && settings.multiShots === true) {
    const list = (extras.shots ?? []).filter((shot) => shot.prompt.trim());
    if (shots.required && list.length === 0) return "Add a shot, or turn multi-shot off";
    if (list.length) {
      const total = list.reduce((sum, shot) => sum + shot.duration, 0);
      if (total < shots.min || total > shots.max) return `Shots must add up to ${shots.min}–${shots.max}s`;
    }
  }
  return null;
}

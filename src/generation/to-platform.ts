import { getModel } from "./catalog";
import type { GenerationPlane, ModelEntry, ModelRoute, PlatformPaths } from "./catalog/types";

type Mapped = { path: string; body: Record<string, unknown> };
type Mapper = (plane: GenerationPlane) => Mapped;

const MAP: Record<string, Mapper> = {
  "soul-cinema": (plane) => mapSoul(plane, "higgsfield-ai/soul/cinema"),
  "soul-2": (plane) => mapSoul(plane, "higgsfield-ai/soul/v2/standard"),
  "kling-3-turbo": mapKlingTurbo,
  "kling-3-std": (plane) => mapKling3(plane, "kling-video/v3.0/std"),
  "kling-3-pro": (plane) => mapKling3(plane, "kling-video/v3.0/pro"),
  "kling-3-4k": (plane) => mapKling3(plane, "kling-video/v3.0/4k"),
  "kling-3-motion-std": (plane) => mapKlingMotion(plane, "kling-video/v3/motion-control/std"),
  "kling-3-motion-pro": (plane) => mapKlingMotion(plane, "kling-video/v3/motion-control/pro"),
  "seedance-2": (plane) => mapSeedance(plane, "bytedance/seedance-2.0"),
  "seedance-2-fast": (plane) => mapSeedance(plane, "bytedance/seedance-2.0/fast"),
  "seedance-2-mini": (plane) => mapSeedance(plane, "bytedance/seedance-2.0/mini"),
  "seedance-2.5": (plane) => mapSeedance(plane, "bytedance/seedance-2.5"),
  "seedance-2.5-edit": (plane) => mapSeedanceSource(plane, "bytedance/seedance-2.5/video-edit", false),
  "seedance-2.5-extend": (plane) => mapSeedanceSource(plane, "bytedance/seedance-2.5/video-extend", true),
  genjutsu: mapGenjutsu,
  "kling-2.5": mapKling25,
};

export function toPlatform(plane: GenerationPlane): Mapped {
  const model = getModel(plane.model);
  const map =
    MAP[model.id] ??
    (model.routes ? (next) => mapRoutes(next, model) : undefined) ??
    (model.paths ? (next) => mapByPaths(next, model.paths!) : undefined);
  if (!map) throw new Error(`No platform map for ${plane.model}`);
  return map(plane);
}

function urls(plane: GenerationPlane, role: "start" | "end" | "reference" | "video" | "audio") {
  return (plane.media[role] ?? []).map((item) => item.url);
}

function mapSoul(plane: GenerationPlane, path: string): Mapped {
  const start = urls(plane, "start")[0];
  const imagePath = plane.model === "soul-2" ? "higgsfield-ai/soul/v2/image-to-image" : path;
  return {
    path: start ? imagePath : path,
    body: {
      prompt: plane.prompt.text,
      batch_size: Number(plane.settings.batchSize),
      resolution: plane.settings.resolution,
      aspect_ratio: plane.settings.aspectRatio,
      enhance_prompt: plane.settings.enhancePrompt,
      ...(start ? { image_url: start } : {}),
    },
  };
}

function mapKling25(plane: GenerationPlane): Mapped {
  const tier = plane.settings.tier === "standard" ? "standard" : "pro";
  const start = urls(plane, "start")[0];
  if (!start && tier === "standard") throw new Error("Kling 2.5 Standard needs a start frame");
  return {
    path: start
      ? `kling-video/v2.5-turbo/${tier}/image-to-video`
      : "kling-video/v2.5-turbo/pro/text-to-video",
    body: {
      prompt: plane.prompt.text,
      duration: Number(plane.settings.duration),
      cfg_scale: plane.settings.cfgScale,
      ...(start ? { image_url: start } : {}),
    },
  };
}

function mapRoutes(plane: GenerationPlane, model: ModelEntry): Mapped {
  const routes = model.routes ?? {};
  const mode = typeof plane.settings.mode === "string" ? plane.settings.mode : "";
  let route = (mode && routes[mode]) || routes.image || routes.text || routes.default;
  const start = urls(plane, "start")[0];
  if (!mode && start && routes.image) route = routes.image;
  if (!mode && !start && routes.text) route = routes.text;
  if (!route) throw new Error(`No platform route for ${model.id}`);
  if ((route.shape === "image" || route.shape === "frames" || route.shape === "motion") && !start && routes.text && mode !== "image" && mode !== "first-last") {
    route = routes.text;
  }
  if ((route.shape === "image" || route.shape === "frames" || route.shape === "motion") && !start) {
    throw new Error("Add a start frame");
  }
  if (route.shape === "source" && !urls(plane, "video")[0]) throw new Error("Add a source video");
  return { path: route.path, body: routeBody(plane, route) };
}

function routeBody(plane: GenerationPlane, route: ModelRoute): Record<string, unknown> {
  const settings = plane.settings;
  const allow = new Set(route.fields);
  const body: Record<string, unknown> = { prompt: plane.prompt.text };
  if (allow.has("duration") && settings.duration !== undefined) {
    const duration = Number(settings.duration);
    body.duration = route.maxDuration ? Math.min(duration, route.maxDuration) : duration;
  }
  if (allow.has("resolution") && typeof settings.resolution === "string") body.resolution = settings.resolution;
  if (allow.has("aspect") && typeof settings.aspectRatio === "string") body.aspect_ratio = settings.aspectRatio;
  if (allow.has("sound")) body.sound = settings.sound ? "on" : "off";
  if (allow.has("cfg") && typeof settings.cfgScale === "number") body.cfg_scale = settings.cfgScale;
  if (allow.has("audioFlag")) body.generate_audio = settings.generateAudio !== false;
  if (allow.has("thinking")) body.enable_thinking = Boolean(settings.enableThinking);
  if (allow.has("extend")) body.prompt_extend = Boolean(settings.promptExtend);
  if (allow.has("tier") && typeof settings.tier === "string") {
    body.mode = route.maxTier === "pro" && settings.tier === "4k" ? "pro" : settings.tier;
  }
  if (allow.has("multi")) body.multi_shots = Boolean(settings.multiShots);
  if (allow.has("format") && typeof settings.outputFormat === "string") body.output_format = settings.outputFormat;
  if (allow.has("fps")) body.fps = Number(settings.fps);
  if (allow.has("camera") && typeof settings.cameraMovement === "string") body.camera_movement = settings.cameraMovement;
  if (allow.has("optimizer")) body.prompt_optimizer = Boolean(settings.promptOptimizer);
  if (allow.has("watermark")) body.aigc_watermark = Boolean(settings.aigcWatermark);
  if (allow.has("shot") && typeof settings.shotType === "string") body.shot_type = settings.shotType;
  if (allow.has("quality") && typeof settings.quality === "string") body.quality = settings.quality;
  if (allow.has("rendering") && typeof settings.renderingSpeed === "string") body.rendering_speed = settings.renderingSpeed;
  if (allow.has("weight") && typeof settings.imageWeight === "number") body.image_weight = settings.imageWeight;

  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const refs = urls(plane, "reference");
  const videos = urls(plane, "video");
  const audios = urls(plane, "audio");
  if (route.shape === "image" && start) {
    body.image_url = start;
    if (end) body[route.endKey ?? "last_image_url"] = end;
  }
  if (route.shape === "frames" || route.frames) {
    if (start) body.first_frame_url = start;
    if (end) body.last_frame_url = end;
  }
  if (route.shape === "motion") {
    if (start) body.image_url = start;
    const video = videos[0];
    if (video) body.video_url = video;
  }
  if (route.shape === "reference" || route.shape === "source") {
    if (route.shape === "reference" && start && !route.frames) body.image_url = start;
    if (refs.length) body.image_urls = refs;
    if (route.shape === "source") {
      const [video, ...rest] = videos;
      if (video) body.video_url = video;
      if (rest.length) body.video_urls = rest;
    } else if (videos.length) {
      body.video_urls = videos;
    }
  }
  if (audios.length && route.audio) {
    if (route.audio === "audio_url") body.audio_url = audios[0];
    else body.audio_urls = audios;
  }
  return body;
}

function mapKlingTurbo(plane: GenerationPlane): Mapped {
  const start = urls(plane, "start")[0];
  return {
    path: start
      ? "kling-video/v3.0-turbo/image-to-video"
      : "kling-video/v3.0-turbo/text-to-video",
    body: {
      prompt: plane.prompt.text,
      duration: plane.settings.duration,
      resolution: plane.settings.resolution,
      ...(start ? { image_url: start } : { aspect_ratio: plane.settings.aspectRatio }),
    },
  };
}

function mapKling3(plane: GenerationPlane, prefix: string): Mapped {
  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const body: Record<string, unknown> = {
    prompt: plane.prompt.text,
    sound: plane.settings.sound ? "on" : "off",
    duration: plane.settings.duration,
    cfg_scale: plane.settings.cfgScale,
    multi_shots: plane.settings.multiShots,
  };
  if (start) {
    body.image_url = start;
    if (end) body.last_image_url = end;
    return { path: `${prefix}/image-to-video`, body };
  }
  body.aspect_ratio = plane.settings.aspectRatio;
  return { path: `${prefix}/text-to-video`, body };
}

function mapKlingMotion(plane: GenerationPlane, path: string): Mapped {
  const start = urls(plane, "start")[0];
  const video = urls(plane, "video")[0];
  return {
    path,
    body: {
      prompt: plane.prompt.text,
      ...(start ? { image_url: start } : {}),
      ...(video ? { video_url: video } : {}),
      keep_original_sound: plane.settings.keepOriginalSound ? "yes" : "no",
      character_orientation: plane.settings.characterOrientation,
    },
  };
}

function mapByPaths(plane: GenerationPlane, spec: PlatformPaths): Mapped {
  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const refs = urls(plane, "reference");
  const videos = urls(plane, "video");
  const body: Record<string, unknown> = {
    prompt: plane.prompt.text,
    ...(plane.settings.aspectRatio ? { aspect_ratio: plane.settings.aspectRatio } : {}),
    ...(plane.settings.resolution ? { resolution: plane.settings.resolution } : {}),
    ...(typeof plane.settings.duration === "number" ? { duration: plane.settings.duration } : {}),
  };
  if (spec.firstLast && (start || end)) {
    return {
      path: spec.firstLast,
      body: {
        ...body,
        ...(start ? { first_frame_url: start } : {}),
        ...(end ? { last_frame_url: end } : {}),
      },
    };
  }
  if (spec.image && start) {
    return {
      path: spec.image,
      body: { ...body, image_url: start, ...(end ? { last_image_url: end } : {}) },
    };
  }
  if (spec.reference && (refs.length || videos.length)) {
    return {
      path: spec.reference,
      body: {
        ...body,
        ...(refs.length ? { image_urls: refs } : {}),
        ...(videos.length ? { video_urls: videos } : {}),
      },
    };
  }
  if (spec.text) {
    return {
      path: spec.text,
      body: refs.length ? { ...body, image_urls: refs } : body,
    };
  }
  if (spec.image) return { path: spec.image, body };
  if (spec.reference) return { path: spec.reference, body };
  if (spec.firstLast) return { path: spec.firstLast, body };
  throw new Error("Model has no platform path");
}

function seedanceBody(plane: GenerationPlane, withDuration: boolean) {
  return {
    prompt: plane.prompt.text,
    resolution: plane.settings.resolution,
    generate_audio: plane.settings.generateAudio,
    ...(withDuration ? { duration: plane.settings.duration } : {}),
    ...(plane.settings.outputFormat ? { output_format: plane.settings.outputFormat } : {}),
  };
}

function mapSeedance(plane: GenerationPlane, prefix: string): Mapped {
  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const refs = urls(plane, "reference");
  const videos = urls(plane, "video");
  const audios = urls(plane, "audio");
  const shared = seedanceBody(plane, true);
  if (start) {
    return {
      path: `${prefix}/image-to-video`,
      body: { ...shared, image_url: start, ...(end ? { end_image_url: end } : {}) },
    };
  }
  if (refs.length || videos.length || audios.length) {
    return {
      path: `${prefix}/reference-to-video`,
      body: {
        ...shared,
        aspect_ratio: plane.settings.aspectRatio,
        ...(refs.length ? { image_urls: refs } : {}),
        ...(videos.length ? { video_urls: videos } : {}),
        ...(audios.length ? { audio_urls: audios } : {}),
      },
    };
  }
  return {
    path: `${prefix}/text-to-video`,
    body: { ...shared, aspect_ratio: plane.settings.aspectRatio },
  };
}

function mapGenjutsu(plane: GenerationPlane): Mapped {
  const video = urls(plane, "video")[0];
  const images = urls(plane, "reference");
  const mode = plane.settings.mode === "object-swap" || plane.settings.mode === "restyle"
    ? plane.settings.mode
    : "motion-transfer";
  const body: Record<string, unknown> = {
    prompt: plane.prompt.text,
    resolution: plane.settings.resolution ?? "720p",
    ...(video ? { video_url: video } : {}),
  };
  if (mode === "restyle") {
    const refs = images.slice(0, 5);
    if (refs.length) body.image_urls = refs;
    if (typeof plane.settings.presetId === "string" && plane.settings.presetId) {
      body.preset_id = plane.settings.presetId;
    }
  } else if (images.length) {
    body.image_urls = images.slice(0, 8);
  }
  return { path: `higgsfield/genjutsu/${mode}/v1.0`, body };
}

function mapSeedanceSource(plane: GenerationPlane, path: string, withDuration: boolean): Mapped {
  const [video, ...extraVideos] = urls(plane, "video");
  const refs = urls(plane, "reference");
  const audios = urls(plane, "audio");
  return {
    path,
    body: {
      ...seedanceBody(plane, withDuration),
      ...(video ? { video_url: video } : {}),
      ...(refs.length ? { image_urls: refs } : {}),
      ...(extraVideos.length ? { video_urls: extraVideos } : {}),
      ...(audios.length ? { audio_urls: audios } : {}),
    },
  };
}

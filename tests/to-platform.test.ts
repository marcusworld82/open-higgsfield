import { describe, expect, it } from "vitest";

import { getModel, parseSettings } from "@/generation/catalog";
import type { GenerationPlane, MediaItem, MediaRole, PlaneExtras } from "@/generation/catalog";
import { parsePresets } from "@/generation/providers";
import { blocker, endNeedsStart, requiredRoles, shotSupport, taggableRoles } from "@/generation/requirements";
import { toPlatform } from "@/generation/to-platform";

/* Request payloads only — nothing here talks to the platform. */

const URL = {
  start: "https://cdn.example.com/start.png",
  end: "https://cdn.example.com/end.png",
  video: "https://cdn.example.com/source.mp4",
  ref1: "https://cdn.example.com/ref1.png",
  ref2: "https://cdn.example.com/ref2.png",
};
const PRESET = "c2143317-f28d-4c3c-a0b8-39bd547e08a7";

function plane(
  modelId: string,
  opts: {
    prompt?: string;
    settings?: Record<string, unknown>;
    media?: Partial<Record<MediaRole, string[]>>;
    extras?: PlaneExtras;
  } = {},
): GenerationPlane {
  const model = getModel(modelId);
  const media: GenerationPlane["media"] = {};
  for (const [role, list] of Object.entries(opts.media ?? {})) {
    media[role as MediaRole] = (list ?? []).map(
      (url, index): MediaItem => ({ id: `${role}-${index}`, url, role: role as MediaRole }),
    );
  }
  return {
    model: model.id,
    prompt: { text: opts.prompt ?? "" },
    media,
    settings: parseSettings(model, opts.settings ?? {}),
    extras: opts.extras,
  };
}

describe("Genjutsu", () => {
  it("motion transfer sends the video and characters, no duration or aspect", () => {
    const out = toPlatform(plane("genjutsu", { media: { video: [URL.video], reference: [URL.ref1, URL.ref2] } }));
    expect(out.path).toBe("higgsfield/genjutsu/motion-transfer/v1.0");
    expect(out.body).toEqual({ prompt: "", resolution: "720p", video_url: URL.video, image_urls: [URL.ref1, URL.ref2] });
    expect(out.body).not.toHaveProperty("duration");
    expect(out.body).not.toHaveProperty("aspect_ratio");
  });

  it("object swap takes products at the chosen quality", () => {
    const out = toPlatform(
      plane("genjutsu", {
        settings: { mode: "object-swap", resolution: "1080p" },
        prompt: "swap the bottle for @image1",
        media: { video: [URL.video], reference: [URL.ref1] },
      }),
    );
    expect(out.path).toBe("higgsfield/genjutsu/object-swap/v1.0");
    expect(out.body).toEqual({ prompt: "swap the bottle for Image 1", resolution: "1080p", video_url: URL.video, image_urls: [URL.ref1] });
  });

  it("restyle sends the picked preset and at most five characters", () => {
    const refs = Array.from({ length: 7 }, (_, index) => `https://cdn.example.com/c${index}.png`);
    const out = toPlatform(
      plane("genjutsu", { settings: { mode: "restyle" }, media: { video: [URL.video], reference: refs }, extras: { presetId: PRESET } }),
    );
    expect(out.path).toBe("higgsfield/genjutsu/restyle/v1.0");
    expect(out.body.preset_id).toBe(PRESET);
    expect(out.body.image_urls).toHaveLength(5);
  });

  it("refuses what the API would reject", () => {
    expect(() => toPlatform(plane("genjutsu", { media: { reference: [URL.ref1] } }))).toThrow(/reference video/);
    expect(() => toPlatform(plane("genjutsu", { media: { video: [URL.video] } }))).toThrow(/character/);
    expect(() => toPlatform(plane("genjutsu", { settings: { mode: "restyle" }, media: { video: [URL.video] } }))).toThrow(/style/);
  });
});

describe("Wan 3.0", () => {
  it("an empty Frames tab is text-to-video with Auto aspect", () => {
    const out = toPlatform(plane("wan-3", { prompt: "a fox", settings: { mode: "image" } }));
    expect(out.path).toBe("alibaba/wan-3.0/text-to-video");
    expect(out.body).toMatchObject({ prompt: "a fox", aspect_ratio: "adaptive", duration: 5, resolution: "1080p", generate_audio: true, enable_thinking: false });
  });

  it("start and end frames go to image-to-video", () => {
    const out = toPlatform(
      plane("wan-3-prime", { prompt: "a fox", settings: { mode: "image", aspectRatio: "9:16" }, media: { start: [URL.start], end: [URL.end] } }),
    );
    expect(out.path).toBe("alibaba/wan-3.0-prime/image-to-video");
    expect(out.body).toMatchObject({ image_url: URL.start, end_image_url: URL.end, aspect_ratio: "9:16" });
  });

  it("an end frame alone is refused", () => {
    expect(() => toPlatform(plane("wan-3", { prompt: "x", settings: { mode: "image" }, media: { end: [URL.end] } }))).toThrow(/start frame/);
  });

  it("references carry images and cite them by number", () => {
    const out = toPlatform(
      plane("wan-3", {
        prompt: "@Image1 walks into @video1",
        settings: { mode: "reference" },
        media: { reference: [URL.ref1, URL.ref2], video: [URL.video] },
      }),
    );
    expect(out.path).toBe("alibaba/wan-3.0/reference-to-video");
    expect(out.body).toMatchObject({ prompt: "Image 1 walks into Video 1", image_urls: [URL.ref1, URL.ref2], video_urls: [URL.video] });
  });
});

describe("Kling 3.0", () => {
  it("start and end frames, sound and CFG", () => {
    const out = toPlatform(plane("kling-3-pro", { prompt: "go", media: { start: [URL.start], end: [URL.end] } }));
    expect(out.path).toBe("kling-video/v3.0/pro/image-to-video");
    expect(out.body).toEqual({ prompt: "go", sound: "on", duration: 5, cfg_scale: 0.5, multi_shots: false, image_url: URL.start, last_image_url: URL.end });
  });

  it("text-to-video carries the aspect", () => {
    const out = toPlatform(plane("kling-3-std", { prompt: "go", settings: { aspectRatio: "9:16" } }));
    expect(out.path).toBe("kling-video/v3.0/std/text-to-video");
    expect(out.body.aspect_ratio).toBe("9:16");
  });

  it("multi-shot with custom shots sends multi_prompt and their sum", () => {
    const out = toPlatform(
      plane("kling-3-4k", {
        prompt: "a chase",
        settings: { multiShots: true, duration: 10 },
        extras: { shots: [{ prompt: "wide", duration: 4 }, { prompt: "close-up", duration: 3 }, { prompt: "  ", duration: 5 }] },
      }),
    );
    expect(out.body).toMatchObject({ multi_shots: true, duration: 7, multi_prompt: [{ prompt: "wide", duration: 4 }, { prompt: "close-up", duration: 3 }] });
  });

  it("multi-shot without shots lets Kling cut them", () => {
    const out = toPlatform(plane("kling-3-pro", { prompt: "a chase", settings: { multiShots: true, duration: 8 } }));
    expect(out.body).toMatchObject({ multi_shots: true, duration: 8 });
    expect(out.body).not.toHaveProperty("multi_prompt");
  });

  it("refuses an end frame alone and shots past 15s", () => {
    expect(() => toPlatform(plane("kling-3-pro", { prompt: "x", media: { end: [URL.end] } }))).toThrow(/start frame/);
    expect(() =>
      toPlatform(plane("kling-3-pro", { prompt: "x", settings: { multiShots: true }, extras: { shots: [{ prompt: "a", duration: 10 }, { prompt: "b", duration: 10 }] } })),
    ).toThrow(/3–15/);
  });
});

describe("Kling O3", () => {
  it("multi-shot needs shots and sends them", () => {
    expect(() => toPlatform(plane("kling-o3", { prompt: "x", settings: { multiShots: true }, media: { start: [URL.start] } }))).toThrow(/shot/);
    const out = toPlatform(
      plane("kling-o3", { prompt: "x", settings: { multiShots: true }, media: { start: [URL.start] }, extras: { shots: [{ prompt: "a", duration: 5 }] } }),
    );
    expect(out.path).toBe("kling-video/o3/first-last-frame");
    expect(out.body).toMatchObject({ multi_shots: true, multi_prompt: [{ prompt: "a", duration: 5 }], duration: 5, first_frame_url: URL.start });
  });
});

describe("Seedance", () => {
  it("keeps @Image tags as written and routes references", () => {
    const out = toPlatform(plane("seedance-2.5", { prompt: "@Image1 dances", media: { reference: [URL.ref1] } }));
    expect(out.path).toBe("bytedance/seedance-2.5/reference-to-video");
    expect(out.body).toMatchObject({ prompt: "@Image1 dances", image_urls: [URL.ref1] });
  });
});

describe("panel requirements", () => {
  it("names what each model still needs", () => {
    const genjutsu = getModel("genjutsu");
    expect(requiredRoles(genjutsu, { mode: "restyle" })).toEqual(["video"]);
    expect(blocker(genjutsu, { mode: "motion-transfer" }, {}, "", {})).toBe("Add a reference video");
    expect(blocker(genjutsu, { mode: "object-swap" }, { video: 1 }, "", {})).toBe("Add an object or product image");
    expect(blocker(genjutsu, { mode: "restyle" }, { video: 1 }, "", {})).toBe("Pick a style");
    expect(blocker(genjutsu, { mode: "restyle" }, { video: 1 }, "", { presetId: PRESET })).toBeNull();

    const wan = getModel("wan-3");
    expect(requiredRoles(wan, { mode: "image" })).toEqual([]);
    expect(endNeedsStart(wan, { mode: "image" })).toBe(true);
    expect(blocker(wan, { mode: "image" }, { end: 1 }, "x", {})).toMatch(/start frame/);
    expect(taggableRoles(wan, { mode: "reference" })).toEqual(["reference", "video", "audio"]);
    expect(taggableRoles(wan, { mode: "image" })).toEqual([]);

    const kling = getModel("kling-3-pro");
    expect(shotSupport(kling, {})).toEqual({ required: false, min: 3, max: 15 });
    expect(taggableRoles(kling, {})).toEqual([]);
    expect(blocker(kling, { multiShots: true }, {}, "x", { shots: [{ prompt: "a", duration: 2 }] })).toMatch(/3–15/);
    expect(requiredRoles(getModel("kling-3-motion-pro"), {})).toEqual(["start", "video"]);
  });
});

describe("restyle presets", () => {
  it("reads the documented list shape", () => {
    expect(
      parsePresets({
        model: "higgsfield/genjutsu/restyle/v1.0",
        items: [
          { id: PRESET, name: "Cel-Shaded CG Anime", preview_url: "https://cdn.higgsfield.ai/restyle_presets/x.webp" },
          { id: "other", name: "", preview_url: "javascript:alert(1)" },
        ],
      }),
    ).toEqual([
      { id: PRESET, name: "Cel-Shaded CG Anime", previewUrl: "https://cdn.higgsfield.ai/restyle_presets/x.webp" },
      { id: "other", name: "Untitled style", previewUrl: null },
    ]);
  });
});

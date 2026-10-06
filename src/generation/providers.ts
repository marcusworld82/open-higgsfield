import type { GenerationPlane } from "./catalog/types";
import type { GenerationStatus } from "./platform";

const OPENAI_SIZE: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "4:3": "1536x1024",
  "9:16": "1024x1536",
  "3:4": "1024x1536",
};

export async function generateOpenAIImage(
  apiKey: string,
  plane: GenerationPlane,
): Promise<GenerationStatus> {
  const variant = plane.settings.variant === "sunburst" ? "sunburst" : "flare";
  const model = `gpt-image-2.5-${variant}`;
  const size = OPENAI_SIZE[String(plane.settings.aspectRatio)] ?? "1024x1024";
  const quality = typeof plane.settings.quality === "string" ? plane.settings.quality : "high";
  const refs = (plane.media.reference ?? []).slice(0, 4).map((item) => item.url);

  const payload = refs.length
    ? await openaiEdit(apiKey, { model, prompt: plane.prompt.text, size, quality, refs })
    : await openaiGenerate(apiKey, { model, prompt: plane.prompt.text, size, quality });

  const url = await imageUrlFromOpenAI(payload);
  return { status: "completed", requestId: "", images: [{ url }] };
}

export async function generateNanoBanana(
  apiKey: string,
  plane: GenerationPlane,
): Promise<GenerationStatus> {
  const resolution = String(plane.settings.resolution ?? "1k").toUpperCase();
  const parts: Array<Record<string, unknown>> = [{ text: plane.prompt.text }];
  for (const item of (plane.media.reference ?? []).slice(0, 8)) {
    const inline = await inlineImage(item.url);
    if (inline) parts.push({ inline_data: inline });
  }
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: plane.settings.aspectRatio ?? "1:1",
            imageSize: resolution,
          },
        },
      }),
    },
  );
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(messageFrom(payload) || `Nano Banana Pro failed (${response.status})`);
  }
  const url = imageUrlFromGemini(payload);
  if (!url) throw new Error("Nano Banana Pro returned no image");
  return { status: "completed", requestId: "", images: [{ url }] };
}

export async function firstGenjutsuPreset(baseUrl: string, apiKey: string): Promise<string> {
  const root = baseUrl.replace(/\/$/, "");
  const response = await fetch(`${root}/models/higgsfield/genjutsu/restyle/v1.0/presets`, {
    headers: { Authorization: `Key ${apiKey}` },
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(messageFrom(payload) || `Could not load Genjutsu presets (${response.status})`);
  }
  const id = findPresetId(payload);
  if (!id) throw new Error("Higgsfield returned no Genjutsu restyle presets");
  return id;
}

async function openaiGenerate(
  apiKey: string,
  input: { model: string; prompt: string; size: string; quality: string },
): Promise<unknown> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      size: input.size,
      quality: input.quality,
      n: 1,
    }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(messageFrom(payload) || `GPT Image failed (${response.status})`);
  return payload;
}

async function openaiEdit(
  apiKey: string,
  input: { model: string; prompt: string; size: string; quality: string; refs: string[] },
): Promise<unknown> {
  const form = new FormData();
  form.set("model", input.model);
  form.set("prompt", input.prompt);
  form.set("size", input.size);
  form.set("quality", input.quality);
  form.set("n", "1");
  for (const [index, url] of input.refs.entries()) {
    form.append("image", await imageFile(url, index));
  }
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(messageFrom(payload) || `GPT Image edit failed (${response.status})`);
  return payload;
}

async function imageUrlFromOpenAI(payload: unknown): Promise<string> {
  const data = asRecord(payload).data;
  const first = Array.isArray(data) ? asRecord(data[0]) : {};
  if (typeof first.url === "string" && first.url) return first.url;
  if (typeof first.b64_json === "string" && first.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }
  throw new Error("GPT Image returned no image");
}

function imageUrlFromGemini(payload: unknown): string | null {
  const candidates = asRecord(payload).candidates;
  if (!Array.isArray(candidates)) return null;
  for (const candidate of candidates) {
    const parts = asRecord(asRecord(candidate).content).parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const record = asRecord(part);
      const inline = asRecord(record.inlineData ?? record.inline_data);
      const data = inline.data;
      if (typeof data !== "string" || !data) continue;
      const mime = typeof inline.mimeType === "string"
        ? inline.mimeType
        : typeof inline.mime_type === "string"
          ? inline.mime_type
          : "image/png";
      return `data:${mime};base64,${data}`;
    }
  }
  return null;
}

function findPresetId(payload: unknown): string | null {
  const piles = [payload];
  const record = asRecord(payload);
  for (const key of ["presets", "items", "data", "results"]) {
    if (Array.isArray(record[key])) piles.push(record[key]);
  }
  for (const pile of piles) {
    if (!Array.isArray(pile)) continue;
    for (const item of pile) {
      const row = asRecord(item);
      const id = row.id ?? row.preset_id ?? row.presetId;
      if (typeof id === "string" && id) return id;
    }
  }
  return null;
}

async function inlineImage(url: string): Promise<{ mime_type: string; data: string } | null> {
  const file = await imageFile(url, 0);
  const buffer = Buffer.from(await file.arrayBuffer());
  return { mime_type: file.type || "image/png", data: buffer.toString("base64") };
}

async function imageFile(url: string, index: number): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not read a reference image");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 12_000_000) throw new Error("A reference image is over 12 MB");
  const blob = await response.blob();
  if (blob.size > 12_000_000) throw new Error("A reference image is over 12 MB");
  const type = blob.type || "image/png";
  const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png";
  return new File([blob], `reference-${index}.${ext}`, { type });
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function messageFrom(payload: unknown): string {
  const record = asRecord(payload);
  const error = asRecord(record.error);
  if (typeof error.message === "string" && error.message) return error.message;
  if (typeof record.message === "string" && record.message) return record.message;
  const detail = record.detail;
  if (typeof detail === "string" && detail) return detail;
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

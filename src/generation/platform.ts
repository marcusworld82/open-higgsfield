import { toAuthorizationHeader } from "./credentials";

const MODEL_ID = /^[a-z0-9][a-z0-9._/-]*$/i;

export class PlatformError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(messageFromBody(status, body));
    this.name = "PlatformError";
    this.status = status;
    this.body = body;
  }
}

export type QueuedGeneration = {
  status: string;
  requestId: string;
  statusUrl: string;
  cancelUrl: string;
};

export type GenerationStatus = {
  status: string;
  requestId: string;
  images?: Array<{ url: string }>;
  video?: { url: string };
  error?: unknown;
};

/** One request's answer inside a batched status poll. A request that errors
    carries its reason alone, so it cannot lose the answers standing beside it. */
export type StatusResult =
  | { requestId: string; status: GenerationStatus }
  | { requestId: string; error: string };

export type PlatformClientOptions = {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
};

export function isModelId(model: string): boolean {
  return MODEL_ID.test(model) && !model.includes("..");
}

export function createPlatformClient(options: PlatformClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetch ?? fetch;
  const auth = toAuthorizationHeader(options.apiKey);

  async function send(method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
    const url = `${baseUrl}${path}`;
    console.info("[platform] request", { method, url, body: body ?? null });
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: auth,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await readJson(response);
    console.info("[platform] response", { method, url, status: response.status, body: payload });
    if (!response.ok) throw new PlatformError(response.status, payload);
    return payload;
  }

  const hosted = new Map<string, string>();

  async function rehostUrl(url: string): Promise<string> {
    if (!url.startsWith("http") || url.includes("higgsfield.ai")) return url;
    const cached = hosted.get(url);
    if (cached) return cached;
    const source = await fetchImpl(url);
    if (!source.ok) throw new PlatformError(400, { detail: `Could not read an input file (${source.status})` });
    const type = mediaType(source.headers.get("content-type") ?? "", url);
    const bytes = new Uint8Array(await source.arrayBuffer());
    const created = asRecord(await send("POST", "/files/generate-upload-url", { content_type: type }));
    const uploadUrl = stringField(created, "upload_url");
    const publicUrl = stringField(created, "public_url");
    if (!uploadUrl || !publicUrl) throw new PlatformError(502, { detail: "Higgsfield did not return an upload URL" });
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(asRecord(created.upload_headers))) {
      if (typeof value === "string") headers[key] = value;
    }
    if (!headers["Content-Type"] && !headers["content-type"]) headers["Content-Type"] = type;
    const put = await fetchImpl(uploadUrl, { method: "PUT", headers, body: bytes });
    if (!put.ok) throw new PlatformError(put.status, { detail: "Could not store an input on Higgsfield" });
    hosted.set(url, publicUrl);
    return publicUrl;
  }

  async function rehostInputs(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const next = { ...input };
    for (const key of ["image_url", "end_image_url", "last_image_url", "video_url", "first_frame_url", "last_frame_url", "audio_url"]) {
      if (typeof next[key] === "string") next[key] = await rehostUrl(next[key]);
    }
    for (const key of ["image_urls", "video_urls", "audio_urls"]) {
      if (!Array.isArray(next[key])) continue;
      next[key] = await Promise.all(
        next[key].map((item) => (typeof item === "string" ? rehostUrl(item) : Promise.resolve(item))),
      );
    }
    return next;
  }

  return {
    async submit(model: string, input: Record<string, unknown>): Promise<QueuedGeneration> {
      if (!isModelId(model)) throw new PlatformError(400, { detail: "Invalid model" });
      const hosted = await rehostInputs(input);
      return mapQueued(await send("POST", `/${model}`, hosted));
    },
    async status(requestId: string): Promise<GenerationStatus> {
      if (!requestId) throw new PlatformError(400, { detail: "Missing request id" });
      return mapStatus(await send("GET", `/requests/${encodeURIComponent(requestId)}/status`));
    },
  };
}

function mapQueued(payload: unknown): QueuedGeneration {
  const data = asRecord(payload);
  const requestId = stringField(data, "request_id");
  if (!requestId) throw new PlatformError(502, { detail: "Platform response missing request_id" });
  return {
    status: stringField(data, "status") ?? "queued",
    requestId,
    statusUrl: stringField(data, "status_url") ?? "",
    cancelUrl: stringField(data, "cancel_url") ?? "",
  };
}

function mapStatus(payload: unknown): GenerationStatus {
  const data = asRecord(payload);
  const requestId = stringField(data, "request_id") ?? "";
  const images = Array.isArray(data.images)
    ? data.images.flatMap((item) => {
        const url = asRecord(item).url;
        return typeof url === "string" ? [{ url }] : [];
      })
    : undefined;
  const videoUrl = asRecord(data.video).url;

  return {
    status: stringField(data, "status") ?? "unknown",
    requestId,
    ...(images?.length ? { images } : {}),
    ...(typeof videoUrl === "string" ? { video: { url: videoUrl } } : {}),
    ...(data.error !== undefined ? { error: data.error } : {}),
  };
}

function mediaType(header: string, url: string): string {
  const raw = header.split(";")[0]?.trim().toLowerCase() ?? "";
  const normalized = raw === "image/jpg" ? "image/jpeg" : raw;
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "audio/wav", "audio/x-wav", "video/mp4"];
  if (allowed.includes(normalized)) return normalized;
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".mp4")) return "video/mp4";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".wav")) return "audio/wav";
  return "image/jpeg";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
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

function messageFromBody(status: number, body: unknown): string {
  const detail = asRecord(body).detail;
  if (typeof detail === "string" && detail) return detail;
  return `Platform request failed (${status})`;
}

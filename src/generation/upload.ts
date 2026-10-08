import { put } from "@vercel/blob/client";

function contentTypeOf(file: File): string | undefined {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".m4v") || name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".wav")) return "audio/wav";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return undefined;
}

export async function uploadMedia(file: File): Promise<{ url: string }> {
  const res = await fetch("/api/blob", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: { pathname: file.name, clientPayload: null, multipart: false },
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(typeof body?.error === "string" ? body.error : `Upload could not start (${res.status})`);
  }
  const { clientToken, pathname } = (await res.json()) as {
    clientToken?: unknown;
    pathname?: unknown;
  };
  if (typeof clientToken !== "string" || typeof pathname !== "string") {
    throw new Error("Failed to retrieve the client token");
  }
  const contentType = contentTypeOf(file);
  const blob = await put(pathname, file, {
    access: "public",
    token: clientToken,
    ...(contentType ? { contentType } : {}),
  });
  return { url: blob.url };
}

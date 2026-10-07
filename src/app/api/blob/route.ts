import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { readAuth } from "@/lib/supabase/server";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_OPTIONS,
  blobPathname,
  resolveDeviceId,
} from "@/generation/device";

/* Upload tokens are handed only to the signed-in owner when Supabase is set
   up. Without Supabase the route stays open, as it always was. The
   upload-completed callback comes from Vercel and is verified by handleUpload,
   so it is not gated here. */

export async function POST(request: Request): Promise<NextResponse> {
  let incoming: HandleUploadBody;
  try {
    incoming = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  }
  if (incoming.type === "blob.generate-client-token") {
    const auth = await readAuth();
    if (auth.configured && !(auth.user && auth.owner)) {
      return NextResponse.json({ error: "Sign in to upload files" }, { status: 401 });
    }
  }
  const device =
    incoming.type === "blob.generate-client-token" ? await readDeviceId() : null;
  const body = device ? withDevicePath(incoming, device.deviceId) : incoming;
  console.info("[blob] upload", summarizeBlobEvent(body));

  try {
    const token = process.env.OPEN_HIGGSFIELD_READ_WRITE_TOKEN;
    if (!token) {
      console.error("[blob] OPEN_HIGGSFIELD_READ_WRITE_TOKEN is not set");
      return NextResponse.json(
        { error: "Uploads are not set up on this server (OPEN_HIGGSFIELD_READ_WRITE_TOKEN is missing)" },
        { status: 503 },
      );
    }
    const json = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async (pathname) => {
        console.info("[blob] token", { pathname });
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "video/mp4",
            "video/quicktime",
            "video/webm",
            "video/x-m4v",
            "audio/wav",
            "audio/x-wav",
          ],
          addRandomSuffix: true,
        };
      },
    });
    return withDeviceCookie(
      json.type === "blob.generate-client-token" && body.type === "blob.generate-client-token"
        ? NextResponse.json({ ...json, pathname: body.payload.pathname })
        : NextResponse.json(json),
      device,
    );
  } catch (error) {
    console.error("[blob] upload failed", error instanceof Error ? error.message : error);
    return withDeviceCookie(NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 }), device);
  }
}

async function readDeviceId() {
  const jar = await cookies();
  return resolveDeviceId(jar.get(DEVICE_COOKIE)?.value);
}

function withDeviceCookie(
  response: NextResponse,
  device: { deviceId: string; minted: boolean } | null,
) {
  if (device?.minted) response.cookies.set(DEVICE_COOKIE, device.deviceId, DEVICE_COOKIE_OPTIONS);
  return response;
}

function withDevicePath(body: HandleUploadBody, deviceId: string): HandleUploadBody {
  if (body.type !== "blob.generate-client-token") return body;
  return {
    ...body,
    payload: { ...body.payload, pathname: blobPathname(deviceId, body.payload.pathname) },
  };
}

function summarizeBlobEvent(body: HandleUploadBody) {
  if (body.type === "blob.generate-client-token") {
    return { type: body.type, pathname: body.payload.pathname };
  }
  return { type: body.type, url: body.payload.blob.url };
}

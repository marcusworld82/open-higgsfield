import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { DEVICE_COOKIE, DEVICE_COOKIE_OPTIONS, resolveDeviceId } from "./generation/device";
import { refreshSession } from "./lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const response = await refreshSession(request, () => NextResponse.next({ request }));
  const { deviceId, minted } = resolveDeviceId(request.cookies.get(DEVICE_COOKIE)?.value);
  if (minted) response.cookies.set(DEVICE_COOKIE, deviceId, DEVICE_COOKIE_OPTIONS);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

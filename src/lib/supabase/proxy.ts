import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { supabaseEnv } from "./config";

/** Refreshes an expiring Supabase session on the way through, writing the new
    tokens to both the request (for this render) and the response (for the
    browser). A no-op when Supabase is not configured. */
export async function refreshSession(
  request: NextRequest,
  makeResponse: () => NextResponse,
): Promise<NextResponse> {
  const env = supabaseEnv();
  let response = makeResponse();
  if (!env) return response;
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = makeResponse();
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

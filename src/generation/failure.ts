import { AuthRequiredError } from "@/lib/supabase/server";

import { MissingCredentialsError } from "./credentials";
import { VaultConfigError } from "./key-vault";
import type { ActionFailure } from "./result";

/** Server side: turns anything an action threw into a failure the client can
    read, and logs the detail that should stay on the server. */
export function toFailure(caught: unknown, where: string): ActionFailure {
  if (caught instanceof MissingCredentialsError) {
    return { ok: false, error: caught.message, code: "missing-key", provider: caught.provider };
  }
  if (caught instanceof AuthRequiredError) {
    return { ok: false, error: caught.message, code: "auth" };
  }
  if (caught instanceof VaultConfigError) {
    console.error(`[${where}]`, caught.message);
    return { ok: false, error: "The server is missing OHF_KEY_ENCRYPTION_SECRET, so keys cannot be saved or read.", code: "config" };
  }
  const message = caught instanceof Error ? caught.message : String(caught);
  console.error(`[${where}]`, message);
  return { ok: false, error: message || "Something went wrong", code: "provider" };
}

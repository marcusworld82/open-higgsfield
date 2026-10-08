import { MissingCredentialsError, type ProviderId } from "./credentials";

/** Next.js replaces the message of anything a server action throws with a
    generic sentence in production builds. Every action therefore returns its
    failure as data, and the client turns it back into an Error it can show. */
export type ActionErrorCode = "auth" | "missing-key" | "config" | "invalid" | "provider";

export type ActionFailure = {
  ok: false;
  error: string;
  code: ActionErrorCode;
  provider?: ProviderId;
};

export type ActionResult<T> = { ok: true; value: T } | ActionFailure;

export class AuthRequired extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthRequired";
  }
}

export class ActionError extends Error {
  readonly code: ActionErrorCode;

  constructor(message: string, code: ActionErrorCode) {
    super(message);
    this.name = "ActionError";
    this.code = code;
  }
}

/** Client side: hands back the value or throws the error the server meant. */
export function unwrap<T>(result: ActionResult<T>): T {
  if (result.ok) return result.value;
  if (result.code === "missing-key") throw new MissingCredentialsError(result.provider);
  if (result.code === "auth") throw new AuthRequired(result.error);
  throw new ActionError(result.error, result.code);
}

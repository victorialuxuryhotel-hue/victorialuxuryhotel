import type { ActionResult } from "./errors";

export const OFFLINE_MESSAGE =
  "No connection to the system. Nothing was lost: tap the button again when the connection is back. It won't be recorded twice.";

/** Wraps a server action for useActionState so a dropped connection shows a message instead of breaking the page. */
export function safeAction<T>(fn: (prev: ActionResult<T> | null, fd: FormData) => Promise<ActionResult<T>>, message = OFFLINE_MESSAGE) {
  return async (prev: ActionResult<T> | null, fd: FormData): Promise<ActionResult<T>> => {
    try {
      return await fn(prev, fd);
    } catch {
      return { ok: false, code: "INTERNAL", message };
    }
  };
}

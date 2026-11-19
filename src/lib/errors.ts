/**
 * Error model shared by server actions, route handlers and domain services.
 *
 * Domain code throws `AppError` with a stable `code`; the boundary (action or
 * route) converts it to an `ActionResult` so the UI receives a safe message and
 * never a raw database or provider error.
 */
export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "INVALID_TRANSITION"
  | "PAYMENT"
  | "RATE_LIMITED"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown; fieldErrors?: Record<string, string[]> }) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = options?.fieldErrors;
  }
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export function toActionError(err: unknown): Extract<ActionResult, { ok: false }> {
  if (err instanceof AppError) {
    return { ok: false, code: err.code, message: err.message, fieldErrors: err.fieldErrors };
  }
  return { ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." };
}

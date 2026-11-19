import "server-only";
import { AppError, type ErrorCode } from "@/lib/errors";

const businessCodes = new Set<ErrorCode>(["VALIDATION", "NOT_FOUND", "CONFLICT", "UNAVAILABLE", "INVALID_TRANSITION", "PAYMENT"]);

type DbError = { message: string; code?: string; hint?: string | null } | null;

/**
 * Converts a Postgres/PostgREST error into an AppError. Business functions
 * raise with HINT = an ErrorCode and a message written for staff and guests,
 * so those pass through. Anything else becomes a generic message (the detail
 * is kept as `cause` for the logs, never shown).
 */
export function throwDbError(error: NonNullable<DbError>, fallback = "Something went wrong. Please try again."): never {
  if (error.hint && businessCodes.has(error.hint as ErrorCode)) {
    throw new AppError(error.hint as ErrorCode, error.message);
  }
  if (error.code === "42501" || /role does not permit|Not signed in as active staff/.test(error.message)) {
    throw new AppError("FORBIDDEN", "Your role does not allow this action.");
  }
  throw new AppError("INTERNAL", fallback, { cause: error });
}

/** Strips characters that have meaning in PostgREST filter syntax from free-text search. */
export function cleanSearch(q: string | undefined | null): string {
  return (q ?? "").replace(/[^\p{L}\p{N}\s@.+\-']/gu, "").trim().slice(0, 60);
}

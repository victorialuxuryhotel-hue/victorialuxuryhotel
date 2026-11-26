import { errorRef } from "./error-ref";

type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

function serializeError(err: unknown): Context {
  if (err instanceof Error) {
    return { errorName: err.name, errorMessage: err.message, stack: err.stack, ...(err.cause ? { cause: serializeError(err.cause) } : {}) };
  }
  if (err && typeof err === "object") {
    try {
      return { error: JSON.parse(JSON.stringify(err)) };
    } catch {
      return { error: Object.prototype.toString.call(err) };
    }
  }
  return { error: String(err) };
}

function emit(level: Level, event: string, context?: Context) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...context });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, context?: Context) => emit("debug", event, context),
  info: (event: string, context?: Context) => emit("info", event, context),
  warn: (event: string, context?: Context) => emit("warn", event, context),
  error: (event: string, err?: unknown, context?: Context) =>
    emit("error", event, { ...context, ...(err === undefined ? {} : { ref: errorRef(err), ...serializeError(err) }) }),
};

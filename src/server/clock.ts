import "server-only";

/** The current time, for server pages that stamp a document ("printed at", reprint checks). */
export const nowIso = () => new Date().toISOString();

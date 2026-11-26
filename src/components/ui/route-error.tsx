"use client";

import { useEffect } from "react";
import { ErrorState } from "./feedback";

/** Next gives every server rendering error a digest that is also in the server log; its first characters are enough to find it. */
export const digestRef = (error: unknown) => {
  const digest = error instanceof Error && "digest" in error ? (error as Error & { digest?: string }).digest : undefined;
  return digest ? digest.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() : undefined;
};

export function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  const reference = digestRef(error);
  useEffect(() => {
    const digest = error instanceof Error && "digest" in error ? (error as Error & { digest?: string }).digest : undefined;
    console.error("route_error", { digest, message: error instanceof Error ? error.message : String(error) });
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <ErrorState description="We couldn't load this page. Try again." onRetry={retry} reference={reference} />
    </div>
  );
}

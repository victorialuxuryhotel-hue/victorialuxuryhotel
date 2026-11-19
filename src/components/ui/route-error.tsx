"use client";

import { useEffect } from "react";
import { ErrorState } from "./feedback";

/** Shared body for error.tsx boundaries. Server errors arrive with a digest only. */
export function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const digest = error instanceof Error && "digest" in error ? (error as Error & { digest?: string }).digest : undefined;
    console.error("route_error", { digest, message: error instanceof Error ? error.message : String(error) });
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <ErrorState description="We couldn't load this page. Please try again." onRetry={retry} />
    </div>
  );
}

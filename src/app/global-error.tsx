"use client";

import { digestRef } from "@/components/ui/route-error";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const reference = digestRef(error);
  return (
    <html lang="en-NG">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Something went wrong</h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Try again. If the problem continues, contact the hotel directly{reference ? <> and quote <strong>Ref {reference}</strong></> : null}.
        </p>
        <button onClick={() => retry()} style={{ padding: "0.6rem 1.2rem", cursor: "pointer" }}>
          Try again
        </button>
      </body>
    </html>
  );
}

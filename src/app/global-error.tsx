"use client";

// Last-resort boundary for errors in the root layout. Must render its own <html>.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en-NG">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Something went wrong</h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>Please try again. If the problem continues, contact the hotel directly.</p>
        <button onClick={() => retry()} style={{ padding: "0.6rem 1.2rem", cursor: "pointer" }}>
          Try again
        </button>
      </body>
    </html>
  );
}

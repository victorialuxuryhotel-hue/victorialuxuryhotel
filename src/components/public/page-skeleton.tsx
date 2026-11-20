import { Container } from "./section";

/** Shown for a moment while a public page's content streams in. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="h-72 animate-pulse bg-navy-950/90 sm:h-96" />
      <Container className="space-y-6 py-16">
        <div className="h-10 w-72 animate-pulse rounded bg-ivory-200" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-card bg-ivory-200" />)}
        </div>
      </Container>
    </div>
  );
}

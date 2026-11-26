import { Container } from "./section";

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="h-72 animate-pulse bg-navy-950/90 sm:h-96" />
      <Container className="space-y-6 py-16">
        <div className="skeleton h-10 w-72" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton aspect-[4/3] !rounded-card" />)}
        </div>
      </Container>
    </div>
  );
}

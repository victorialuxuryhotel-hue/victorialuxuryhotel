import { Container, Eyebrow } from "./section";

/** Banner for inner pages: consistent, calm, and fast to scan. */
export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <section className="relative overflow-hidden bg-navy-950 text-ivory-50">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(4_48_160/0.6),transparent_55%)]" />
      <div aria-hidden className="absolute -right-10 -bottom-24 font-display text-[18rem] leading-none text-gold-400/10 select-none">
        V
      </div>
      <Container className="relative py-16 sm:py-24">
        <Eyebrow className="text-gold-300">{eyebrow}</Eyebrow>
        <h1 className="mt-4 max-w-3xl font-display text-5xl leading-[1.05] sm:text-6xl">{title}</h1>
        {intro ? <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ivory-200/85">{intro}</p> : null}
      </Container>
    </section>
  );
}

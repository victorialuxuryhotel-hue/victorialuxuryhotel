import { Container, Eyebrow } from "./section";

export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <section className="relative overflow-hidden bg-navy-950 text-ivory-50">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(4_48_160/0.6),transparent_55%)]" />
      <div aria-hidden className="absolute -right-6 -bottom-14 font-display text-[10rem] leading-none text-gold-400/10 select-none sm:-right-10 sm:-bottom-24 sm:text-[18rem]">
        V
      </div>
      <Container className="relative py-10 sm:py-24">
        <Eyebrow className="text-gold-300">{eyebrow}</Eyebrow>
        <h1 className="mt-3 max-w-3xl font-display text-[2.125rem] leading-[1.08] text-balance sm:mt-4 sm:text-6xl sm:leading-[1.05]">{title}</h1>
        {intro ? <p className="mt-4 max-w-2xl text-base leading-relaxed text-ivory-200/85 sm:mt-5 sm:text-lg">{intro}</p> : null}
      </Container>
    </section>
  );
}

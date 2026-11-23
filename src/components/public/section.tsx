import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function Section({
  className,
  tone = "light",
  children,
  id,
}: {
  className?: string;
  tone?: "light" | "ivory" | "navy";
  children: ReactNode;
  id?: string;
}) {
  const tones = {
    light: "bg-ivory-50",
    ivory: "bg-ivory-100",
    navy: "bg-navy-950 text-ivory-50",
  };
  return (
    <section id={id} className={cn("py-16 sm:py-24", tones[tone], className)}>
      <Container>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-gold-600", className)}>
      <span aria-hidden className="h-px w-8 bg-current" />
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
  invert,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: "left" | "center";
  invert?: boolean;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <Eyebrow className={cn(align === "center" && "justify-center", invert && "text-gold-300")}>{eyebrow}</Eyebrow> : null}
      <h2 className={cn("mt-4 font-display text-4xl leading-tight sm:text-5xl", invert ? "text-ivory-50" : "text-navy-950")}>{title}</h2>
      {intro ? <p className={cn("mt-4 text-base leading-relaxed sm:text-lg", invert ? "text-ivory-200/80" : "text-ink-600")}>{intro}</p> : null}
    </div>
  );
}

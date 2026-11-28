import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** Page width of the 28 Nov designs: 1440 wide with 64px sides on a computer, 16px on a phone. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-360 px-4 lg:px-16", className)}>{children}</div>;
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
    light: "bg-white",
    ivory: "bg-ivory-100",
    navy: "bg-[#0b1f5c] text-white",
  };
  return (
    <section id={id} className={cn("py-7 lg:py-18", tones[tone], className)}>
      <Container>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs font-semibold tracking-[0.14em] text-gold-500 uppercase lg:text-[13px]", className)}>{children}</p>;
}

/** An eyebrow, a serif headline (32px on a phone, 44px on a computer) and an optional intro. */
export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
  invert,
  as: Tag = "h2",
  className,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: "left" | "center";
  invert?: boolean;
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? <Eyebrow className={cn("mb-1.5", invert && "text-gold-200")}>{eyebrow}</Eyebrow> : null}
      <Tag className={cn("font-display text-[32px] leading-[1.1] font-semibold lg:text-[44px]", invert ? "text-white" : "text-ink-900")}>{title}</Tag>
      {intro ? <p className={cn("mt-3 text-base leading-relaxed", invert ? "text-[#d3d9ee]" : "text-muted")}>{intro}</p> : null}
    </div>
  );
}

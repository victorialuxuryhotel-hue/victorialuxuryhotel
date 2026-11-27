import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "./feedback";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "border border-navy-800 text-navy-800 hover:bg-navy-800/12 active:bg-navy-800/22",
  accent: "border border-gold-500 text-gold-800 hover:bg-gold-500/12 active:bg-gold-500/22",
  secondary: "border border-hairline text-ink-900 hover:bg-ink-900/7 active:bg-ink-900/14",
  ghost: "text-navy-800 hover:bg-navy-800/10 active:bg-navy-800/18",
  danger: "border border-danger-600 text-danger-700 hover:bg-danger-600/10 active:bg-danger-600/20",
};

/** The guest website uses filled buttons; these only apply inside `.guest`. */
const guestVariants: Record<Variant, string> = {
  primary: "guest:bg-navy-800 guest:font-medium guest:text-white guest:hover:border-navy-700 guest:hover:bg-navy-700",
  accent: "guest:border-gold-400 guest:bg-gold-400 guest:font-semibold guest:text-navy-950 guest:hover:border-gold-300 guest:hover:bg-gold-300",
  secondary: "guest:border-ink-300 guest:bg-white guest:font-medium guest:hover:bg-ivory-100",
  ghost: "guest:font-medium",
  danger: "guest:bg-white guest:font-medium guest:hover:bg-danger-50",
};

const sizes: Record<Size, string> = {
  // Touch screens (the bar POS is touch at laptop width) get at least 44px, whatever the width.
  sm: "h-8 px-3 text-sm pointer-coarse:h-11 pointer-coarse:px-4",
  md: "h-11.5 px-4 text-base md:h-10 md:text-sm pointer-coarse:h-11.5",
  lg: "h-12.5 px-6 text-base",
};

export function buttonStyles({ variant = "primary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md bg-transparent font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    variants[variant],
    guestVariants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size; pending?: boolean };

export function Button({ variant, size, pending, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonStyles({ variant, size, className })} disabled={disabled || pending} aria-busy={pending || undefined} {...rest}>
      {pending ? <Spinner className="size-4" label="Working" /> : null}
      {children}
    </button>
  );
}

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "./feedback";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/**
 * Classical buttons: outlined, never filled. Hover tints 12%, pressed 22%.
 * Disabled is 45% opacity. Colours stay the hotel's navy and gold.
 */
const variants: Record<Variant, string> = {
  primary: "border border-navy-800 text-navy-800 hover:bg-navy-800/12 active:bg-navy-800/22",
  accent: "border border-gold-500 text-gold-800 hover:bg-gold-500/12 active:bg-gold-500/22",
  secondary: "border border-hairline text-ink-900 hover:bg-ink-900/7 active:bg-ink-900/14",
  ghost: "text-navy-800 hover:bg-navy-800/10 active:bg-navy-800/18",
  danger: "border border-danger-600 text-danger-700 hover:bg-danger-600/10 active:bg-danger-600/20",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-11.5 px-4 text-base md:h-10 md:text-sm",
  lg: "h-12.5 px-6 text-base",
};

/** Class string for buttons and for links styled as buttons. */
export function buttonStyles({ variant = "primary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md bg-transparent font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    variants[variant],
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

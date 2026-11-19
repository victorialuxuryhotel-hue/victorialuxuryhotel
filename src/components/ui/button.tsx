import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "./feedback";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-navy-800 text-white hover:bg-navy-700 disabled:bg-navy-800/50",
  accent: "bg-gold-400 text-navy-950 hover:bg-gold-300 disabled:bg-gold-400/50",
  secondary: "border border-ink-300 bg-white text-ink-900 hover:bg-ivory-100 disabled:text-ink-400",
  ghost: "text-ink-700 hover:bg-ivory-200 disabled:text-ink-400",
  danger: "bg-danger-600 text-white hover:bg-danger-700 disabled:bg-danger-600/50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

/** Class string for buttons and for links styled as buttons. */
export function buttonStyles({ variant = "primary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed",
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; pending?: boolean };

export function Button({ variant, size, pending, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonStyles({ variant, size, className })} disabled={disabled || pending} aria-busy={pending || undefined} {...rest}>
      {pending ? <Spinner className="size-4" label="Working" /> : null}
      {children}
    </button>
  );
}

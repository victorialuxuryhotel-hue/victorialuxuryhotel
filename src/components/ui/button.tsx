import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "./feedback";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "border border-navy-800 bg-navy-800 font-medium text-white hover:border-navy-700 hover:bg-navy-700",
  accent: "border border-gold-400 bg-gold-400 font-semibold text-navy-950 hover:border-gold-300 hover:bg-gold-300",
  secondary: "border border-ink-300 bg-white font-medium text-ink-900 hover:bg-ivory-100",
  ghost: "bg-transparent font-medium text-navy-800 hover:bg-navy-800/10",
  danger: "border border-danger-600 bg-white font-medium text-danger-700 hover:bg-danger-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-11.5 px-4 text-base md:h-10 md:text-sm",
  lg: "h-12.5 px-6 text-base",
};

export function buttonStyles({ variant = "primary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md transition-[background-color,border-color,color,transform] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
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

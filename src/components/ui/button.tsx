import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "./feedback";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/**
 * Staff app (design R1): four kinds. Primary (filled navy, one per area), secondary (the alternative),
 * ghost (tertiary text button), danger (destroys or reverses). Accent (gold) is the brand accent, e.g. Lock.
 */
const variants: Record<Variant, string> = {
  primary: "border border-navy-900 bg-navy-900 font-semibold text-white hover:bg-navy-800 active:bg-navy-950",
  accent: "border border-gold-500 bg-gold-400 font-semibold text-navy-950 hover:bg-gold-300",
  secondary: "border border-[#cfcabd] bg-white font-semibold text-ink-900 hover:bg-ivory-100 active:bg-ivory-200",
  ghost: "border border-transparent font-semibold text-navy-700 hover:bg-navy-50 active:bg-navy-100",
  danger: "border border-[#f1b8b8] bg-white font-semibold text-danger-700 hover:bg-danger-50 active:bg-danger-50",
};

/** Small inside table rows (36px), medium in forms (44px), large on the till and keypads (60px). Touch screens get 44px at least. */
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm pointer-coarse:h-11 pointer-coarse:px-4",
  md: "h-11 px-[18px] text-[15px]",
  lg: "h-15 px-6 text-lg",
};

/** The guest website (28 Nov designs) uses the same buttons as the staff app. */
export function buttonStyles({ variant = "primary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex w-fit shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-45",
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

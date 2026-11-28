import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils/cn";

/** Initials beside a guest's name (interface brief I11, design R1: one pale navy tone). Decorative: the name is always shown next to it. */
export function GuestAvatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      data-avatar=""
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-[#e8eefb] font-bold text-navy-800",
        size === "sm" ? "size-7 text-[11px]" : size === "lg" ? "size-11 text-sm" : "size-9 text-xs",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

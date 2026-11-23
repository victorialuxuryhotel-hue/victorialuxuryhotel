import Image from "next/image";
import { hotel } from "@/config/hotel";
import { cn } from "@/lib/utils/cn";
import fullLogo from "../../../public/brand/logo-full.png";
import mark from "../../../public/brand/logo-mark.png";

export function Logo({ variant = "mark", className, priority }: { variant?: "full" | "mark"; className?: string; priority?: boolean }) {
  return (
    <Image
      src={variant === "full" ? fullLogo : mark}
      alt={hotel.name}
      className={cn("h-auto", className)}
      priority={priority}
    />
  );
}

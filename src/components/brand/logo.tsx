import Image from "next/image";
import { hotel } from "@/config/hotel";
import { cn } from "@/lib/utils/cn";
import fullLogo from "../../../public/brand/logo-full.png";
import mark from "../../../public/brand/logo-mark.png";

/**
 * Interim logo assets were extracted from the hotel's scope PDF (raster,
 * white background removed). Replace with the original vector logo when the
 * hotel supplies it; dimensions come from the static import.
 *
 * - "full": monogram + wordmark, for light backgrounds.
 * - "mark": monogram only; works on light or dark backgrounds.
 */
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

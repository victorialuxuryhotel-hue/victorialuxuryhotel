import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import type { Photo as PhotoContent } from "@/content/site";

/**
 * A photograph slot. Renders the hotel's photo when `image` is set; until the
 * hotel supplies photography it renders a quiet branded placeholder of the
 * same shape, so layouts don't shift when real images arrive.
 *
 * Positioning (relative/absolute) is left to the caller via `className`.
 */
export function Photo({
  photo,
  className,
  sizes = "(min-width: 1024px) 50vw, 100vw",
  priority,
  tone = "light",
}: {
  photo: PhotoContent;
  className?: string;
  sizes?: string;
  priority?: boolean;
  tone?: "light" | "dark";
}) {
  if (photo.image) {
    return (
      <div className={cn("overflow-hidden bg-ivory-200", !/\babsolute\b/.test(className ?? "") && "relative", className)}>
        <Image src={photo.image} alt={photo.alt} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }

  const dark = tone === "dark";
  return (
    <div
      role="img"
      aria-label={`${photo.alt} (photograph to come)`}
      className={cn(
        "overflow-hidden",
        !/\babsolute\b/.test(className ?? "") && "relative",
        dark ? "bg-navy-900" : "bg-gradient-to-br from-ivory-100 via-ivory-200 to-[#e6dccb]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-center font-display text-[min(9rem,40%)] leading-none select-none",
          dark ? "text-white/[0.06]" : "text-navy-900/[0.06]",
        )}
      >
        V
      </span>
      <span
        className={cn(
          "absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] backdrop-blur",
          dark ? "bg-ivory-50/10 text-white/60" : "bg-ivory-50/60 text-ink-500",
        )}
      >
        {photo.alt}
      </span>
    </div>
  );
}

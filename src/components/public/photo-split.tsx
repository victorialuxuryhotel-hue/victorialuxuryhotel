import { cn } from "@/lib/utils/cn";
import type { Photo as PhotoContent } from "@/content/site";
import { Photo } from "./photo";

/**
 * Up to four photos sharing one frame (the home page's On site cards): one fills it, two sit side by
 * side, three are one tall and two stacked, four make a 2×2 grid. No photo shows `fallback`'s placeholder.
 */
export function PhotoSplit({
  photos,
  fallback,
  className,
  sizes,
  tone,
}: {
  photos: PhotoContent[];
  fallback: PhotoContent;
  className?: string;
  sizes: string;
  tone?: "light" | "dark";
}) {
  const shown = photos.slice(0, 4);
  if (shown.length <= 1) return <Photo photo={shown[0] ?? fallback} className={className} sizes={sizes} tone={tone} />;
  return (
    <div data-photos={shown.length} className={cn("grid gap-1 overflow-hidden", shown.length === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2", className)}>
      {shown.map((p, i) => (
        <Photo key={p.image ?? i} photo={p} tone={tone} sizes={sizes} className={cn("h-full min-h-0", shown.length === 3 && i === 0 && "row-span-2")} />
      ))}
    </div>
  );
}

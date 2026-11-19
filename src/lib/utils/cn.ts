import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the project's custom theme keys so overrides resolve.
const twMerge = extendTailwindMerge({
  extend: {
    theme: { radius: ["card"], shadow: ["card"] },
  },
});

/** Joins class names; later classes override conflicting earlier ones. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(" "));
}

"use client";

import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { helpFor } from "@/content/help";
import { useStaffRole } from "./staff-role";

/** "?" next to a page title: the 3–5 steps of the screen's main task (interface brief I10). Esc closes it. */
export function HelpButton() {
  const help = helpFor(usePathname(), useStaffRole());
  if (!help) return null;
  return (
    <details data-popover="" data-help="" className="group relative inline-block align-middle print:hidden">
      <summary
        aria-label={`Help: ${help.task}`}
        className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full text-ink-400 hover:bg-ivory-200 hover:text-ink-900 [&::-webkit-details-marker]:hidden"
      >
        <CircleHelp className="size-5" aria-hidden />
      </summary>
      <div className="absolute top-full left-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-hairline bg-ivory-50 p-4 text-sm shadow-lg">
        <p className="font-medium text-ink-900">{help.task}</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-ink-700">
          {help.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </div>
    </details>
  );
}

/** The one line under a title saying what the screen is for, when the page doesn't give its own. */
export function HelpPurpose({ className }: { className?: string }) {
  const help = helpFor(usePathname(), useStaffRole());
  return help ? <p className={className}>{help.purpose}</p> : null;
}

"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
        }
      }}
      className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm text-navy-800 hover:bg-navy-800/10", className)}
    >
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}

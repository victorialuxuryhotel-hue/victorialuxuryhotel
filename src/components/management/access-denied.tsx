import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

/** Shown when a signed-in staff member opens a page their role doesn't cover. */
export function AccessDenied() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <ShieldAlert className="size-12 text-ink-400" strokeWidth={1.5} aria-hidden />
      <h1 className="mt-4 text-xl font-semibold text-ink-900">You don&apos;t have access to this page</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">Your role doesn&apos;t include this area. Ask the hotel owner if you need it.</p>
      <Link href="/app/today" className={buttonStyles({ variant: "secondary", className: "mt-6" })}>Back to Today</Link>
    </div>
  );
}

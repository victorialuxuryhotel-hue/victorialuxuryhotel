import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const control =
  "block w-full rounded-md border border-ink-300 bg-white px-3 text-base text-ink-900 md:text-sm placeholder:text-ink-400 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-600/20 disabled:bg-ivory-100 aria-invalid:border-danger-600";

/**
 * Label + control + hint/error, wired for accessibility. Pass the control as
 * children with the same `id` as `htmlFor`.
 */
export function Field({ label, htmlFor, hint, error, required, children, className }: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-700">
        {label}
        {required ? <span className="text-danger-600"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-danger-700">{error}</p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-11.5 md:h-10", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, "h-11.5 pr-8 md:h-10", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 py-2", className)} {...props} />;
}

/** Form-level error summary (e.g. "Those dates are no longer available"). */
export function FormMessage({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "error" ? "border-danger-600/20 bg-danger-50 text-danger-700" : "border-success-600/20 bg-success-50 text-success-700",
      )}
    >
      {children}
    </div>
  );
}

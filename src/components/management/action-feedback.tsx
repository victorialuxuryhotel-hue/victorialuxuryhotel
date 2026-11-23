"use client";

import { createContext, useCallback, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import { CheckCircle2, X } from "lucide-react";
import type { ActionResult } from "@/lib/errors";
import { undoChange } from "@/server/reservations";

const UNDO_SECONDS = 10;

type Feedback = { message: string; undo?: { reservationId: string; undoId: number } };
type Shown = Feedback & { at: number; key: number };

const FeedbackContext = createContext<(f: Feedback) => void>(() => {});

export function useActionFeedback() {
  return useContext(FeedbackContext);
}

export function withFeedback<T>(
  action: (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>,
  onSuccess: (data: T) => void,
) {
  return async (prev: ActionResult<T> | null, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) onSuccess(result.data);
    return result;
  };
}

export function ActionFeedbackProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const show = useCallback((f: Feedback) => setShown({ ...f, at: Date.now(), key: Math.random() }), []);
  return (
    <FeedbackContext value={show}>
      {shown ? <Banner key={shown.key} shown={shown} onClose={() => setShown(null)} onReplace={show} /> : null}
      {children}
    </FeedbackContext>
  );
}

function Banner({ shown, onClose, onReplace }: { shown: Shown; onClose: () => void; onReplace: (f: Feedback) => void }) {
  const [left, setLeft] = useState(shown.undo ? UNDO_SECONDS : 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!shown.undo) return;
    const timer = setInterval(() => {
      const remaining = UNDO_SECONDS - Math.floor((Date.now() - shown.at) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [shown]);

  function undo() {
    if (!shown.undo) return;
    const { reservationId, undoId } = shown.undo;
    startTransition(async () => {
      const result = await undoChange(reservationId, undoId);
      if (result.ok) onReplace({ message: result.data.message });
      else setError(result.message);
    });
  }

  return (
    <div className="sticky top-14 z-30 px-4 pt-3 lg:top-0 lg:px-8">
      <div role="status" className="flex items-start gap-3 rounded-md border border-success-600/25 bg-success-50 px-3 py-2.5 text-sm text-success-700 shadow-sm">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-ink-900">{shown.message}</p>
          {error ? <p role="alert" className="mt-1 text-danger-700">{error}</p> : null}
        </div>
        {shown.undo && left > 0 && !error ? (
          <button
            type="button"
            onClick={undo}
            disabled={pending}
            className="-my-1 inline-flex h-9 shrink-0 items-center rounded-md border border-success-600/30 bg-ivory-50 px-3 font-medium text-navy-800 tabular-nums hover:bg-ivory-50 disabled:opacity-60"
          >
            {pending ? "Undoing…" : `Undo · ${left}s`}
          </button>
        ) : null}
        <button type="button" onClick={onClose} aria-label="Dismiss" className="-my-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-500 hover:bg-success-600/10">
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

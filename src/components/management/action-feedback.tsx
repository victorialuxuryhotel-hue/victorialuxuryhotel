"use client";

import { createContext, useCallback, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import type { ActionResult } from "@/lib/errors";
import { undoChange } from "@/server/reservations";

const UNDO_SECONDS = 10;

type Feedback = {
  message: string;
  /** A booking change the server recorded and can reverse. */
  undo?: { reservationId: string; undoId: number };
  /** Any other change: puts things back and says what happened. */
  revert?: { run: () => Promise<ActionResult<unknown>>; message: string };
};
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
  const undoable = Boolean(shown.undo || shown.revert);
  const [left, setLeft] = useState(undoable ? UNDO_SECONDS : 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!undoable) return;
    const timer = setInterval(() => {
      const remaining = UNDO_SECONDS - Math.floor((Date.now() - shown.at) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [shown, undoable]);

  function undo() {
    const { undo: booking, revert } = shown;
    startTransition(async () => {
      if (revert) {
        const result = await revert.run();
        if (result.ok) onReplace({ message: revert.message });
        else setError(result.message);
      } else if (booking) {
        const result = await undoChange(booking.reservationId, booking.undoId);
        if (result.ok) onReplace({ message: result.data.message });
        else setError(result.message);
      }
    });
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6 print:hidden">
      <div role="status" className="toast-in pointer-events-auto flex max-w-xl items-center gap-3 rounded-xl bg-navy-950 py-2.5 pr-2.5 pl-3.5 text-sm text-ivory-50 shadow-float">
        <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-gold-400 text-navy-950"><Check className="size-3.5" strokeWidth={3} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p>{shown.message}</p>
          {error ? <p role="alert" className="mt-1 text-gold-200">{error}</p> : null}
        </div>
        {undoable && left > 0 && !error ? (
          <button
            type="button"
            onClick={undo}
            disabled={pending}
            className="inline-flex h-9 shrink-0 items-center rounded-md border border-white/25 px-3.5 font-semibold text-gold-300 tabular-nums hover:bg-white/10 disabled:opacity-60"
          >
            {pending ? "Undoing…" : `Undo · ${left}s`}
          </button>
        ) : null}
        <button type="button" onClick={onClose} aria-label="Dismiss" className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ivory-200/70 hover:bg-white/10">
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

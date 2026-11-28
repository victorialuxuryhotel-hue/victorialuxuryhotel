"use client";

import { Delete } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { signInWithPin } from "@/server/station";
import { cn } from "@/lib/utils/cn";

export type RosterPerson = { id: string; fullName: string; hasPin: boolean; lockedMinutes: number };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function Avatar({ name, size = "sm", picked = false }: { name: string; size?: "sm" | "lg"; picked?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold text-navy-950",
        size === "lg" ? "size-12 text-base" : "size-[34px] text-[13px]",
        picked ? "bg-[#e4a92b]" : "bg-[#e8eefb]",
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * The counter lock (design S2): tap your name, enter your PIN. Used by the /station page and by the
 * lock that covers a station's screen, so an order or form underneath stays as it was. When the owner
 * set the PIN, the person chooses their own before the session starts.
 */
export function StationSignIn({ stationName, roster, onSignedIn }: { stationName: string; roster: RosterPerson[]; onSignedIn: (name: string) => void }) {
  const [picked, setPicked] = useState<RosterPerson | null>(null);
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"pin" | "new" | "repeat">("pin");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reset = (p: RosterPerson | null) => {
    setPicked(p);
    setPin("");
    setNewPin("");
    setRepeat("");
    setStep("pin");
    setError(null);
  };

  const [repeat, setRepeat] = useState("");
  const shown = step === "pin" ? pin : step === "new" ? newPin : repeat;
  const type = (k: string) => {
    setError(null);
    const set = step === "pin" ? setPin : step === "new" ? setNewPin : setRepeat;
    set((prev) => (k === "back" ? prev.slice(0, -1) : prev.length >= 6 ? prev : prev + k));
  };

  const submit = () => {
    if (!picked || pending) return;
    if (shown.length < 4) return setError("A PIN is 4 to 6 digits.");
    if (step === "new") {
      setStep("repeat");
      setRepeat("");
      return;
    }
    if (step === "repeat" && repeat !== newPin) {
      setError("Those PINs don't match. Choose your new PIN again.");
      setStep("new");
      setNewPin("");
      setRepeat("");
      return;
    }
    start(async () => {
      const r = await signInWithPin({ staffId: picked.id, pin, newPin: step === "repeat" ? newPin : undefined });
      if (!r.ok) {
        setError(r.message);
        if (step === "pin") setPin("");
        else {
          setStep("new");
          setNewPin("");
          setRepeat("");
        }
        return;
      }
      if (r.data.status === "choose_new") {
        setStep("new");
        return;
      }
      onSignedIn(r.data.name ?? picked.fullName);
    });
  };

  // A physical keyboard works too (desk computers).
  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) type(e.key);
      else if (e.key === "Backspace") type("back");
      else if (e.key === "Enter") submit();
      else if (e.key === "Escape") reset(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const first = picked?.fullName.split(" ")[0] ?? "";
  const prompt = step === "pin" ? `${first}, enter your PIN` : step === "new" ? "Choose your own PIN" : "Enter your new PIN again";

  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-10 bg-navy-950 p-6 tabular-nums lg:flex-row lg:gap-14">
      <div className="flex w-full max-w-[460px] flex-col gap-4">
        <p className="font-brand text-[30px] text-white">{stationName}</p>
        <p className="text-[15px] text-[#cfd6f0]">Locked. Tap your name to start.</p>
        {roster.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {roster.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => reset(p)}
                  disabled={!p.hasPin}
                  aria-pressed={picked?.id === p.id}
                  className={cn(
                    "flex h-[84px] w-full flex-col items-center justify-center gap-1.5 rounded-xl bg-white disabled:opacity-60",
                    picked?.id === p.id ? "border-2 border-[#021c6c]" : "border border-[#e4e0d6]",
                  )}
                >
                  <Avatar name={p.fullName} picked={picked?.id === p.id} />
                  <span className="text-sm font-semibold text-[#171b24]">{p.fullName}</span>
                  {!p.hasPin ? <span className="text-[11px] text-ink-500">No PIN yet</span> : p.lockedMinutes ? <span className="text-[11px] text-danger-700">Locked {p.lockedMinutes} min</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-white/10 p-4 text-sm text-[#cfd6f0]">Nobody can sign in here yet. The owner gives each person a PIN in Staff &amp; access.</p>
        )}
        <Link href="/login" className="w-fit text-sm text-[#f4d88c] hover:text-white">Manager sign-in</Link>
      </div>

      {picked ? (
        <div className="flex w-full max-w-[380px] flex-col items-center gap-[18px] rounded-2xl bg-white p-7">
          <Avatar name={picked.fullName} size="lg" picked />
          <p className="text-xl font-bold text-[#171b24]" id="pin-prompt">{prompt}</p>
          <div className="flex gap-3.5" aria-hidden>
            {Array.from({ length: Math.max(4, shown.length) }, (_, i) => (
              <span key={i} className={cn("size-[18px] rounded-full border-2 border-[#021c6c]", i < shown.length ? "bg-[#021c6c]" : "bg-white")} />
            ))}
          </div>
          <span className="sr-only" aria-live="polite">{shown.length} digits entered</span>
          {error ? <p role="alert" className="text-center text-sm text-danger-700">{error}</p> : null}
          <div role="group" aria-labelledby="pin-prompt" className="grid w-full grid-cols-3 gap-2.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "ok", "0", "back"].map((k) => (
              <button
                key={k}
                type="button"
                disabled={pending}
                onClick={() => (k === "ok" ? submit() : type(k))}
                aria-label={k === "back" ? "Delete last digit" : k === "ok" ? "Sign in" : k}
                className={cn(
                  "flex h-[62px] items-center justify-center rounded-xl border text-2xl font-semibold active:bg-navy-50 disabled:opacity-60",
                  k === "ok" ? "border-[#021c6c] bg-[#021c6c] text-base text-white" : "border-[#e4e0d6] bg-white text-[#171b24]",
                )}
              >
                {k === "back" ? <Delete className="size-6" aria-hidden /> : k === "ok" ? (pending ? "…" : step === "new" ? "Next" : "OK") : k}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => reset(null)} className="text-sm text-[#0430a0] hover:text-[#021c6c]">Not you? Pick another name</button>
        </div>
      ) : null}
    </div>
  );
}

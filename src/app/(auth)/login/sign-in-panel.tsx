"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignOutButton, useSignIn } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";

/** Only allow redirects back into the management app (no open redirects). */
function safeNext(next: string | undefined) {
  return next && /^\/app(\/[\w\-/]*)?$/.test(next) ? next : "/app";
}

/** Plain words for the Clerk errors staff are likely to hit. */
function friendly(code: string | undefined, fallback: string | undefined): string {
  switch (code) {
    case "form_identifier_not_found":
      return "There's no staff account for this email. Check it, or use the invitation email the owner sent you.";
    case "form_code_incorrect":
      return "That code isn't right. Check the latest email and try again.";
    case "verification_expired":
      return "That code has expired. Send a new one.";
    case "too_many_requests":
      return "Too many tries. Wait a minute, then try again.";
    case "strategy_for_user_invalid":
      return "Sign-in by email code isn't switched on for this account. WhatsApp the manager.";
    default:
      return fallback ?? "Something went wrong. Please try again.";
  }
}

/**
 * Staff sign-in by emailed code only (6c): work email → "Email me a sign-in
 * code" → 6-digit code. No passwords and no sign-up; new staff arrive through
 * the owner's invitation.
 */
export function SignInPanel({ next }: { next?: string }) {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [message, setMessage] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const busy = fetchStatus === "fetching" || !signIn;

  const sendCode = async () => {
    if (!signIn) return;
    setMessage(null);
    const { error } = await signIn.emailCode.sendCode({ emailAddress: email.trim() });
    if (error) {
      setMessage(friendly(error.code, error.longMessage));
      return false;
    }
    setStep("code");
    return true;
  };

  const verify = async () => {
    if (!signIn) return;
    setMessage(null);
    const { error } = await signIn.emailCode.verifyCode({ code: code.trim() });
    if (error) {
      setMessage(friendly(error.code, error.longMessage));
      return;
    }
    if (signIn.status !== "complete") {
      setMessage("This account needs another sign-in step that the hotel doesn't use. WhatsApp the manager.");
      return;
    }
    await signIn.finalize({
      navigate: ({ decorateUrl }) => {
        const url = decorateUrl(safeNext(next));
        if (url.startsWith("http")) window.location.href = url;
        else router.push(url);
      },
    });
  };

  const fieldError = errors.fields.identifier?.longMessage ?? undefined;
  const codeError = errors.fields.code?.longMessage ?? undefined;

  if (step === "code") {
    return (
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        <p className="text-sm text-ink-600">
          We sent a 6-digit code to <span className="text-ink-900">{email.trim()}</span>. It can take a minute; check spam or Promotions if it isn&apos;t there.
        </p>
        {message ? <FormMessage>{message}</FormMessage> : null}
        {resent && !message ? <FormMessage tone="success">New code sent.</FormMessage> : null}
        <Field label="Sign-in code" htmlFor="code" error={message ? undefined : codeError}>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
            required
            className="text-center text-xl tracking-[0.5em] tabular-nums"
          />
        </Field>
        <Button type="submit" size="lg" pending={busy} disabled={code.length < 6} className="w-full">Sign in</Button>
        <div className="flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setMessage(null);
            }}
            className="min-h-11 text-ink-600 underline-offset-2 hover:underline"
          >
            Use another email
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setCode("");
              setResent(Boolean(await sendCode()));
            }}
            className="min-h-11 text-navy-800 underline-offset-2 hover:underline disabled:opacity-45"
          >
            Send a new code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void sendCode();
      }}
    >
      {message ? <FormMessage>{message}</FormMessage> : null}
      <Field label="Work email" htmlFor="email" error={message ? undefined : fieldError}>
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Button type="submit" size="lg" pending={busy} className="w-full">Email me a sign-in code</Button>
    </form>
  );
}

/**
 * Signed in with Clerk, but not (or no longer) active staff. Sign-in would
 * just bounce back here, so offer to sign out instead.
 */
export function AccessDenied() {
  return (
    <div className="space-y-5">
      <FormMessage>This account doesn&apos;t have access to hotel management. If you think it should, contact the hotel manager.</FormMessage>
      <SignOutButton redirectUrl="/login">
        <Button type="button" variant="secondary" size="lg" className="w-full">
          Sign out and use another account
        </Button>
      </SignOutButton>
    </div>
  );
}

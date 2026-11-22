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
    case "form_password_incorrect":
    case "form_password_or_identifier_incorrect":
      return "That username or password isn't right. Check them and try again.";
    case "form_code_incorrect":
      return "That code isn't right. Check the latest email and try again.";
    case "verification_expired":
      return "That code has expired. Send a new one.";
    case "too_many_requests":
    case "user_locked":
      return "Too many tries. Wait a few minutes, then try again.";
    default:
      return fallback ?? "Something went wrong. Please try again.";
  }
}

/**
 * Staff sign-in with username (or email) and password. Clerk may ask a new
 * device to confirm with a code emailed to the account; that step is handled
 * here too. No sign-up: new staff arrive through the owner's invitation.
 */
export function SignInPanel({ next }: { next?: string }) {
  const { signIn, fetchStatus } = useSignIn();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "code">("password");
  const [message, setMessage] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const busy = fetchStatus === "fetching" || !signIn;

  const finish = async () => {
    if (!signIn) return;
    await signIn.finalize({
      navigate: ({ decorateUrl }) => {
        const url = decorateUrl(safeNext(next));
        if (url.startsWith("http")) window.location.href = url;
        else router.push(url);
      },
    });
  };

  const sendDeviceCode = async () => {
    if (!signIn) return false;
    const { error } = await signIn.mfa.sendEmailCode();
    if (error) {
      setMessage(friendly(error.code, error.longMessage));
      return false;
    }
    return true;
  };

  const submitPassword = async () => {
    if (!signIn) return;
    setMessage(null);
    const { error } = await signIn.password({ identifier: identifier.trim(), password });
    if (error) {
      setMessage(friendly(error.code, error.longMessage));
      return;
    }
    if (signIn.status === "complete") return finish();
    if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
      if (await sendDeviceCode()) setStep("code");
      return;
    }
    setMessage("This account needs a sign-in step the hotel doesn't use. Ask the owner to check it.");
  };

  const verifyCode = async () => {
    if (!signIn) return;
    setMessage(null);
    const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
    if (error) {
      setMessage(friendly(error.code, error.longMessage));
      return;
    }
    if (signIn.status === "complete") return finish();
    setMessage("Something went wrong. Please try again.");
  };

  if (step === "code") {
    return (
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void verifyCode();
        }}
      >
        <p className="text-sm text-ink-600">
          New device: we&apos;ve emailed a 6-digit code to the address on your account. Check spam or Promotions if it isn&apos;t there.
        </p>
        {message ? <FormMessage>{message}</FormMessage> : null}
        {resent && !message ? <FormMessage tone="success">New code sent.</FormMessage> : null}
        <Field label="Code" htmlFor="code">
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
        <Button type="submit" size="lg" pending={busy} disabled={code.length < 6} className="w-full">Continue</Button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setCode("");
            setResent(await sendDeviceCode());
          }}
          className="min-h-11 text-sm text-navy-800 underline-offset-2 hover:underline disabled:opacity-45"
        >
          Send a new code
        </button>
      </form>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submitPassword();
      }}
    >
      {message ? <FormMessage>{message}</FormMessage> : null}
      <Field label="Username or email" htmlFor="identifier">
        <Input id="identifier" name="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false} value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Button type="submit" size="lg" pending={busy} className="w-full">Sign in</Button>
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

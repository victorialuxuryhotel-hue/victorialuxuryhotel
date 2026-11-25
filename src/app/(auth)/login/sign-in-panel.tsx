"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignOutButton, useSignIn } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";

function safeNext(next: string | undefined) {
  return next && /^\/app(\/[\w\-/]*)?$/.test(next) ? next : "/app";
}

type ClerkFailure = { code?: string; longMessage?: string; errors?: ReadonlyArray<{ code?: string; longMessage?: string }> };

/** Clerk API failures carry the specific code on `errors[0]`; the top-level code is generic. */
function friendly(error: ClerkFailure): string {
  const detail = error.errors?.[0];
  const code = detail?.code ?? error.code;
  const fallback = detail?.longMessage ?? error.longMessage;
  switch (code) {
    case "form_identifier_not_found":
    case "form_password_incorrect":
    case "form_password_or_identifier_incorrect":
      return "That username or password isn't right. Check them and try again.";
    case "form_code_incorrect":
      return "That code isn't right. Check it and try again.";
    case "verification_expired":
      return "That code has expired. Send a new one.";
    case "too_many_requests":
    case "user_locked":
      return "Too many tries. Wait a few minutes, then try again.";
    default:
      return fallback ?? "Something went wrong. Please try again.";
  }
}

export function SignInPanel({ next }: { next?: string }) {
  const { signIn, fetchStatus } = useSignIn();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "code" | "app">("password");
  const [backup, setBackup] = useState(false);
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
      setMessage(friendly(error));
      return false;
    }
    return true;
  };

  const submitPassword = async () => {
    if (!signIn) return;
    setMessage(null);
    const { error } = await signIn.password({ identifier: identifier.trim(), password });
    if (error) {
      setMessage(friendly(error));
      return;
    }
    if (signIn.status === "complete") return finish();
    if (signIn.status === "needs_second_factor" && signIn.supportedSecondFactors.some((f) => f.strategy === "totp")) {
      setStep("app");
      return;
    }
    if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
      if (await sendDeviceCode()) setStep("code");
      return;
    }
    setMessage("This account needs a sign-in step the hotel doesn't use. Ask the owner to check it.");
  };

  const verifyCode = async () => {
    if (!signIn) return;
    setMessage(null);
    const { error } =
      step === "app"
        ? backup
          ? await signIn.mfa.verifyBackupCode({ code: code.trim() })
          : await signIn.mfa.verifyTOTP({ code: code.trim() })
        : await signIn.mfa.verifyEmailCode({ code: code.trim() });
    if (error) {
      setMessage(friendly(error));
      return;
    }
    if (signIn.status === "complete") return finish();
    setMessage("Something went wrong. Please try again.");
  };

  if (step === "app") {
    return (
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void verifyCode();
        }}
      >
        <p className="text-sm text-ink-600">
          {backup ? "Enter one of the backup codes you saved when you set up the app." : "Open your authenticator app and enter the 6-digit code for Victoria Luxury Hotel."}
        </p>
        {message ? <FormMessage>{message}</FormMessage> : null}
        <Field label={backup ? "Backup code" : "Code"} htmlFor="code">
          <Input
            id="code"
            name="code"
            inputMode={backup ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={backup ? 20 : 6}
            value={code}
            onChange={(e) => setCode(backup ? e.target.value.trim() : e.target.value.replace(/\D/g, ""))}
            autoFocus
            required
            className="text-center text-xl tracking-[0.3em] tabular-nums"
          />
        </Field>
        <Button type="submit" size="lg" pending={busy} disabled={code.length < 6} className="w-full">Continue</Button>
        <button
          type="button"
          onClick={() => {
            setCode("");
            setMessage(null);
            setBackup((b) => !b);
          }}
          className="min-h-11 text-sm text-navy-800 underline-offset-2 hover:underline"
        >
          {backup ? "Use the app code instead" : "Lost your phone? Use a backup code"}
        </button>
      </form>
    );
  }

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

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error?: string; email?: string };

const schema = z.object({
  email: z.email("Enter a valid email address").max(254),
  password: z.string().min(1, "Enter your password").max(200),
  next: z.string().optional(),
});

/** Only allow redirects back into the management app (no open redirects). */
function safeNext(next: string | undefined) {
  return next && /^\/app(\/[\w\-/]*)?$/.test(next) ? next : "/app";
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    // Same message for unknown email and wrong password: don't reveal which accounts exist.
    logger.warn("auth.sign_in_failed", { reason: error?.code ?? "unknown" });
    return { error: "Email or password is incorrect.", email };
  }

  // A valid auth user is not enough: they must be active staff.
  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) {
    await supabase.auth.signOut();
    logger.warn("auth.sign_in_not_staff", { userId: data.user.id });
    return { error: "This account does not have access. Contact the hotel manager.", email };
  }

  logger.info("auth.sign_in", { userId: data.user.id });
  redirect(safeNext(parsed.data.next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

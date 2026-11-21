import { ClerkProvider } from "@clerk/nextjs";

/** Sign-in and invitation pages use Clerk (the public website never loads it). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <ClerkProvider signInUrl="/login">{children}</ClerkProvider>;
}

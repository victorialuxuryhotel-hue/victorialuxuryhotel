import { ClerkProvider } from "@clerk/nextjs";
import { guestFont as staffFont } from "@/components/public/guest-font";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider signInUrl="/login">
      <div className={`staff ${staffFont.variable} flex min-h-screen flex-1 flex-col`}>{children}</div>
    </ClerkProvider>
  );
}

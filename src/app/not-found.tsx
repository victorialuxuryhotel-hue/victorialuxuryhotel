import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold-600">404</p>
      <h1 className="mt-3 font-display text-4xl text-navy-900">Page not found</h1>
      <p className="mt-3 text-ink-500">The page you are looking for does not exist or has moved.</p>
      <Link href="/" className="mt-8 text-navy-700 underline underline-offset-4">
        Return to the homepage
      </Link>
    </main>
  );
}

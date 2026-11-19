import { Lock } from "lucide-react";
import { BookingSummary, Steps } from "@/components/booking/booking-ui";
import { Container } from "@/components/public/section";
import { Button } from "@/components/ui/button";
import { chosen, search } from "../_search";

export default function Page() {
  return (
    <Container className="py-10 sm:py-14">
      <Steps current={3} />
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_24rem] lg:gap-16">
        <div>
          <h1 className="font-display text-4xl text-navy-950 sm:text-5xl">Review and pay</h1>
          <p className="mt-3 text-ink-600">Your room is held for 30 minutes while you pay.</p>
          <dl className="mt-8 divide-y divide-ivory-200 rounded-card bg-white text-sm shadow-card">
            {[["Name", "Adaeze Okafor"], ["Email", "adaeze@example.com"], ["Phone", "+234 803 000 0001"], ["Special requests", "Late arrival, around 9pm"]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 px-5 py-4"><dt className="text-ink-500">{k}</dt><dd className="text-right text-ink-900">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-6 text-sm text-ink-600">
            You&apos;ll be taken to Paystack to pay securely by card, bank transfer or USSD. Your booking is confirmed as soon as Paystack confirms
            your payment.
          </p>
          <Button size="lg" className="mt-6 w-full sm:w-auto"><Lock className="size-4" aria-hidden /> Pay securely with Paystack</Button>
        </div>
        <BookingSummary option={chosen} search={search} />
      </div>
    </Container>
  );
}

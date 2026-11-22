import Link from "next/link";
import { MessageCircle, Phone } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { hotel } from "@/config/hotel";
import { Container } from "./section";

export function CtaBand({ title = "Your stay at Victoria begins here" }: { title?: string }) {
  return (
    <section className="relative overflow-hidden bg-gold-400">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.08]"
        style={{ backgroundImage: "repeating-linear-gradient(45deg, #011248 0 1px, transparent 1px 24px)" }}
      />
      <Container className="relative flex flex-col items-start justify-between gap-6 py-14 md:flex-row md:items-center">
        <div>
          <h2 className="font-display text-4xl leading-tight text-navy-950">{title}</h2>
          <p className="mt-2 text-navy-900/80">Book online in minutes, or speak to our front desk.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/book" className={buttonStyles({ size: "lg", className: "border-navy-950 text-navy-950 hover:bg-navy-950/12" })}>
            Book your stay
          </Link>
          <a href={`tel:${hotel.phone}`} className={buttonStyles({ variant: "secondary", size: "lg", className: "border-navy-950/35 text-navy-950 hover:bg-ivory-50/30" })}>
            <Phone className="size-4" aria-hidden /> Call
          </a>
          <a href={`https://wa.me/${hotel.whatsapp}`} className={buttonStyles({ variant: "secondary", size: "lg", className: "border-navy-950/35 text-navy-950 hover:bg-ivory-50/30" })}>
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </a>
        </div>
      </Container>
    </section>
  );
}

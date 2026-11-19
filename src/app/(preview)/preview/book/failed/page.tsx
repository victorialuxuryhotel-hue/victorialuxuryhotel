import { PaymentFailed } from "@/components/booking/outcome";
import { Container } from "@/components/public/section";

export default function Page() {
  return <Container className="py-24"><PaymentFailed retryHref="/preview/book/payment" /></Container>;
}

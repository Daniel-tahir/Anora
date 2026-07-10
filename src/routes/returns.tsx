import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/returns")({
  head: () => ({
    meta: [
      { title: "Exchange & Returns — ANORA" },
      {
        name: "description",
        content: "ANORA's exchange and return policy — 14-day returns on unworn pieces.",
      },
    ],
  }),
  component: Returns,
});

function Returns() {
  return (
    <div className="px-5 lg:px-10 py-16 max-w-3xl mx-auto">
      <div className="text-center mb-12">
        <span className="eyebrow">Care</span>
        <h1 className="font-serif text-5xl mt-3">Exchange & Returns</h1>
      </div>
      <div className="space-y-10 text-[15px] leading-[1.85] text-foreground/90">
        <Section title="Return Period">
          We accept returns within 14 days of delivery. Pieces must be unworn, unwashed and returned
          in their original packaging with all tags attached.
        </Section>
        <Section title="Exchange Conditions">
          Exchanges are offered for size or colour, subject to availability. Fine jewellery and
          made-to-order garments are final sale.
        </Section>
        <Section title="Refund Policy">
          Refunds are processed to the original payment method within 5–7 business days of our
          receiving and inspecting your return.
        </Section>
        <Section title="How to Request an Exchange">
          Request an exchange from My Orders, or email{" "}
          <span className="text-gold">care@anora.com</span> with your order number. We will arrange
          complimentary collection and dispatch your new piece the moment your original is received.
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <span className="gold-rule" />
        <h2 className="eyebrow">{title}</h2>
      </div>
      <p>{children}</p>
    </section>
  );
}

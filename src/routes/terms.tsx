import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — ANORA" },
      {
        name: "description",
        content: "Terms governing the use of the ANORA website and services.",
      },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <div className="px-5 lg:px-10 py-16 max-w-3xl mx-auto">
      <div className="text-center mb-12">
        <span className="eyebrow">Legal</span>
        <h1 className="font-serif text-5xl mt-3">Terms & Conditions</h1>
      </div>
      <div className="space-y-10 text-[15px] leading-[1.85] text-foreground/90">
        <p>
          These terms govern your use of the ANORA website and services. By accessing the site you
          agree to these terms in full.
        </p>
        <Section title="Use of the Site">
          The site and its contents are owned by ANORA and protected by copyright. Personal,
          non-commercial use is permitted.
        </Section>
        <Section title="Orders">
          All orders are subject to availability and confirmation. We reserve the right to refuse or
          cancel any order.
        </Section>
        <Section title="Pricing">
          Prices are displayed in USD and may be subject to local taxes and duties at checkout.
        </Section>
        <Section title="Liability">
          To the fullest extent permitted by law, ANORA shall not be liable for any indirect or
          consequential loss arising from use of the site.
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

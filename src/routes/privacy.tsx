import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/config";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | ANORA New York" },
      { name: "description", content: "How ANORA collects, uses, and protects your information." },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Privacy Policy | ANORA New York" },
      {
        property: "og:description",
        content: "How ANORA collects, uses, and protects your information.",
      },
      { property: "og:url", content: `${SITE_URL}/privacy` },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE_URL}/logo.png` },
      { property: "og:site_name", content: "ANORA" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Privacy Policy | ANORA New York" },
      {
        name: "twitter:description",
        content: "How ANORA collects, uses, and protects your information.",
      },
      { name: "twitter:image", content: `${SITE_URL}/logo.png` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/privacy` }],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="px-5 lg:px-10 py-16 max-w-3xl mx-auto">
      <div className="text-center mb-12">
        <span className="eyebrow">Legal</span>
        <h1 className="font-serif text-5xl mt-3">Privacy Policy</h1>
      </div>
      <div className="space-y-10 text-[15px] leading-[1.85] text-foreground/90">
        <Section title="Information Collection">
          We collect only the information required to fulfil your order and improve your experience
          — name, contact details, delivery address, and payment information.
        </Section>
        <Section title="Cookies">
          Cookies allow us to remember your preferences and personalise content. You may disable
          cookies in your browser at any time.
        </Section>
        <Section title="Payment Security">
          Payments are processed by certified PCI-DSS compliant providers. We do not store your card
          details on our servers.
        </Section>
        <Section title="Third Party Services">
          Selected partners assist us with shipping, analytics and marketing. They are bound by
          strict confidentiality agreements.
        </Section>
        <Section title="Your Rights">
          You may request access, correction or deletion of your personal data at any time by
          contacting <span className="text-gold">privacy@anora.com</span>.
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

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { faqs } from "@/lib/products";
import { SITE_URL } from "@/lib/config";

export const Route = createFileRoute("/faqs")({
  head: () => ({
    meta: [
      { title: "FAQs | ANORA New York" },
      {
        name: "description",
        content:
          "Answers to the most common questions about ANORA orders, shipping, returns, and jewellery care.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "FAQs | ANORA New York" },
      {
        property: "og:description",
        content:
          "Answers to the most common questions about ANORA orders, shipping, returns, and jewellery care.",
      },
      { property: "og:url", content: `${SITE_URL}/faqs` },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE_URL}/logo.png` },
      { property: "og:site_name", content: "ANORA" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "FAQs | ANORA New York" },
      {
        name: "twitter:description",
        content:
          "Answers to the most common questions about ANORA orders, shipping, returns, and jewellery care.",
      },
      { name: "twitter:image", content: `${SITE_URL}/logo.png` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/faqs` }],
  }),
  component: FaqsPage,
});

function FaqsPage() {
  const [open, setOpen] = useState<number | null>(0);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };

  return (
    <div className="px-5 lg:px-10 py-16 max-w-3xl mx-auto">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="text-center mb-12">
        <span className="eyebrow">Help</span>
        <h1 className="font-serif text-5xl mt-3">Frequently Asked</h1>
      </div>
      <div className="divide-y divide-border border-t border-b border-border">
        {faqs.map((f, i) => (
          <div key={f.q}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-start justify-between gap-6 py-6 text-left"
            >
              <span className="font-serif text-xl md:text-2xl pr-6">{f.q}</span>
              <ChevronDown
                className={`mt-2 h-4 w-4 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`}
              />
            </button>
            {open === i && (
              <p className="pb-6 -mt-2 text-muted-foreground leading-relaxed animate-fade">{f.a}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

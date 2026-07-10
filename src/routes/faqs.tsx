import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { faqs } from "@/lib/products";

export const Route = createFileRoute("/faqs")({
  head: () => ({
    meta: [
      { title: "FAQs — ANORA" },
      {
        name: "description",
        content:
          "Answers to the most common questions about ANORA orders, shipping, returns, and jewellery care.",
      },
    ],
  }),
  component: FaqsPage,
});

function FaqsPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="px-5 lg:px-10 py-16 max-w-3xl mx-auto">
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

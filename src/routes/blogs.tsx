import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { blogPosts } from "@/lib/products";

export const Route = createFileRoute("/blogs")({
  head: () => ({
    meta: [
      { title: "Journal — ANORA" },
      {
        name: "description",
        content:
          "Stories from the ANORA atelier — craft, material, and the quiet pleasures of dress.",
      },
      { property: "og:title", content: "Journal — ANORA" },
    ],
  }),
  component: Blogs,
});

function Blogs() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const cats = ["All", ...Array.from(new Set(blogPosts.map((b) => b.category)))];
  const filtered = useMemo(
    () =>
      blogPosts.filter(
        (b) =>
          (cat === "All" || b.category === cat) &&
          (b.title.toLowerCase().includes(q.toLowerCase()) ||
            b.excerpt.toLowerCase().includes(q.toLowerCase())),
      ),
    [q, cat],
  );

  return (
    <div className="px-5 lg:px-10 py-16 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <span className="eyebrow">The Journal</span>
        <h1 className="font-serif text-5xl md:text-6xl mt-4">Quiet dispatches</h1>
        <p className="mt-5 text-muted-foreground max-w-xl mx-auto">
          Stories from the atelier — craft, material, and the quiet pleasures of dress.
        </p>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-14">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search journal…"
          className="w-full md:w-64 bg-transparent border-b border-border px-1 py-2 text-sm outline-none focus:border-foreground"
        />
        <div className="flex gap-2">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`text-[11px] tracking-[0.28em] uppercase px-4 py-2 border transition-colors ${
                cat === c
                  ? "border-foreground"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-10">
        {filtered.map((b) => (
          <Link key={b.slug} to="/blogs/$slug" params={{ slug: b.slug }} className="group block">
            <div className="overflow-hidden aspect-[4/3] bg-neutral">
              <img
                src={b.cover}
                alt={b.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-[1200ms] group-hover:scale-105"
              />
            </div>
            <p className="eyebrow mt-5">
              {b.category} · {b.readTime}
            </p>
            <h3 className="font-serif text-2xl mt-3 group-hover:text-gold transition-colors">
              {b.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{b.excerpt}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";

interface TOCItem {
  text: string;
  id: string;
  level: 2 | 3;
}

export function TableOfContents({ content }: { content: string }) {
  const [headings, setHeadings] = useState<TOCItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (!content) return;

    // Scan for markdown headings ## and ###
    const lines = content.split("\n");
    const parsedHeadings: TOCItem[] = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("## ")) {
        const text = trimmed.slice(3).trim();
        const id = text
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-");
        parsedHeadings.push({ text, id, level: 2 });
      } else if (trimmed.startsWith("### ")) {
        const text = trimmed.slice(4).trim();
        const id = text
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-");
        parsedHeadings.push({ text, id, level: 3 });
      }
    });

    setHeadings(parsedHeadings);
  }, [content]);

  // Monitor active scroll section
  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries.find((entry) => entry.isIntersecting);
        if (visibleEntry) {
          setActiveId(visibleEntry.target.id);
        }
      },
      { rootMargin: "0px 0px -60% 0px" }
    );

    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => {
      headings.forEach((h) => {
        const el = document.getElementById(h.id);
        if (el) observer.unobserve(el);
      });
    };
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav className="space-y-4">
      <p className="text-[10px] tracking-[0.3em] uppercase text-foreground/50 font-sans font-semibold">
        Table of Contents
      </p>
      <ul className="space-y-3 font-serif text-sm">
        {headings.map((h) => (
          <li
            key={h.id}
            style={{ paddingLeft: h.level === 3 ? "1rem" : "0" }}
            className="leading-tight"
          >
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({
                  behavior: "smooth",
                });
                setActiveId(h.id);
              }}
              className={`block transition-all duration-300 ${
                activeId === h.id
                  ? "text-gold translate-x-1"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

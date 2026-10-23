import React from "react";

export function RichTextRenderer({ content }: { content: string }) {
  if (!content) return null;

  // Split content by double newlines to isolate blocks
  const blocks = content.split(/\n\s*\n/);

  return (
    <div className="max-w-none font-serif text-lg leading-relaxed text-foreground/90 space-y-6">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        // Code block
        if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
          const lines = trimmed.split("\n");
          // Remove start/end delimiters
          const code = lines.slice(1, -1).join("\n");
          return (
            <pre key={index} className="bg-neutral/60 dark:bg-neutral/10 p-5 overflow-x-auto border border-border/60 text-xs sm:text-sm font-mono text-foreground leading-relaxed my-6 rounded-[1px]">
              <code>{code}</code>
            </pre>
          );
        }

        // Block quote
        if (trimmed.startsWith(">")) {
          const text = trimmed.replace(/^>\s*/, "").trim();
          return (
            <blockquote key={index} className="border-l-2 border-gold pl-6 py-1 italic my-8 text-xl text-muted-foreground font-serif leading-relaxed">
              {text}
            </blockquote>
          );
        }

        // Heading 2
        if (trimmed.startsWith("## ")) {
          const text = trimmed.slice(3).trim();
          const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
          return (
            <h2 key={index} id={id} className="font-serif text-2xl md:text-3xl text-foreground pt-6 pb-2 border-b border-border/20 scroll-mt-24">
              {text}
            </h2>
          );
        }

        // Heading 3
        if (trimmed.startsWith("### ")) {
          const text = trimmed.slice(4).trim();
          const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
          return (
            <h3 key={index} id={id} className="font-serif text-xl md:text-2xl text-foreground pt-4 pb-1 scroll-mt-24">
              {text}
            </h3>
          );
        }

        // Unordered list
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const items = trimmed
            .split(/\n/)
            .map((item) => item.replace(/^[*\-]\s+/, "").trim())
            .filter(Boolean);
          return (
            <ul key={index} className="list-disc pl-6 space-y-2.5 my-6 text-foreground/95">
              {items.map((item, i) => (
                <li key={i} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          );
        }

        // Ordered list
        if (/^\d+\.\s+/.test(trimmed)) {
          const items = trimmed
            .split(/\n/)
            .map((item) => item.replace(/^\d+\.\s+/, "").trim())
            .filter(Boolean);
          return (
            <ol key={index} className="list-decimal pl-6 space-y-2.5 my-6 text-foreground/95">
              {items.map((item, i) => (
                <li key={i} className="leading-relaxed">{item}</li>
              ))}
            </ol>
          );
        }

        // Responsive Image block: ![alt](url)
        const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
        if (imgMatch) {
          const alt = imgMatch[1];
          const src = imgMatch[2];
          return (
            <div key={index} className="my-10 flex flex-col gap-2">
              <img
                src={src}
                alt={alt || "Blog asset"}
                loading="lazy"
                className="w-full max-h-[520px] object-cover border border-border/40 hover:opacity-95 transition-opacity"
              />
              {alt && (
                <span className="text-xs text-center text-muted-foreground/80 tracking-wide font-sans mt-2">
                  {alt}
                </span>
              )}
            </div>
          );
        }

        // Table parsing
        if (trimmed.startsWith("|") && trimmed.includes("\n|")) {
          const lines = trimmed
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.startsWith("|") && l.endsWith("|"));
          if (lines.length >= 2) {
            const rows = lines.map((line) =>
              line
                .slice(1, -1)
                .split("|")
                .map((cell) => cell.trim())
            );
            const headers = rows[0];
            const dataRows = rows.slice(2); // Skip separator row
            return (
              <div key={index} className="overflow-x-auto my-8 border border-border/40 rounded-[1px]">
                <table className="w-full text-left text-sm border-collapse font-sans">
                  <thead>
                    <tr className="bg-neutral border-b border-border/60">
                      {headers.map((h, i) => (
                        <th
                          key={i}
                          className="p-4 font-semibold tracking-wider text-[10px] uppercase text-muted-foreground"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {dataRows.map((row, ri) => (
                      <tr key={ri} className="hover:bg-neutral/10 transition-colors">
                        {row.map((cell, ci) => (
                          <td key={ci} className="p-4 text-foreground/90 leading-relaxed">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
        }

        // Fallback paragraph
        return (
          <p key={index} className="text-foreground/90 leading-[1.85] text-lg font-serif">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

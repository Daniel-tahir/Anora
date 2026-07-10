import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect } from "react";
import { subcategories } from "@/lib/products";
import { useActiveCategories, type CategoryNode } from "@/lib/categories";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MenuDrawer({ open, onClose }: Props) {
  const { data: dbCategories = [] } = useActiveCategories();

  const categories = dbCategories.length > 0 ? dbCategories : [];

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm transition-opacity duration-500 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-full max-w-md bg-background shadow-luxe transform transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-7 h-16 lg:h-20 border-b border-border/70">
          <Link
            to="/"
            onClick={onClose}
            className="font-serif text-2xl tracking-[0.3em] hover:text-gold transition-colors"
          >
            ANORA
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="hover:text-gold transition-all duration-300 hover:scale-105"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="h-[calc(100%-5rem)] overflow-y-auto px-7 py-10 space-y-10">
          {categories.length > 0 ? (
            categories.map((cat) => (
              <Section
                key={cat.id}
                title={cat.name}
                items={cat.children.map((c) => ({ name: c.name, slug: c.slug }))}
                base={`/shop/${cat.slug}`}
                onNav={onClose}
              />
            ))
          ) : (
            <>
              <Section
                title="Clothing"
                items={subcategories.clothing.map((c) => ({ name: c, slug: c.toLowerCase() }))}
                base="/shop/clothing"
                onNav={onClose}
              />
              <Section
                title="Jewellery"
                items={subcategories.jewellery.map((c) => ({ name: c, slug: c.toLowerCase() }))}
                base="/shop/jewellery"
                onNav={onClose}
              />
            </>
          )}
          <div className="pt-6 border-t border-border/60 space-y-5">
            {[
              { to: "/blogs", label: "Blogs" },
              { to: "/faqs", label: "FAQs" },
              { to: "/returns", label: "Exchange & Return" },
              { to: "/privacy", label: "Privacy Policy" },
              { to: "/contact", label: "Contact Us" },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={onClose}
                className="block text-sm tracking-wide text-foreground/80 hover:text-gold transition-colors duration-300"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

function Section({
  title,
  items,
  base,
  onNav,
}: {
  title: string;
  items: { name: string; slug: string }[];
  base: string;
  onNav: () => void;
}) {
  return (
    <div>
      <Link
        to={base}
        onClick={onNav}
        className="font-serif text-3xl block mb-5 hover:text-gold transition-colors duration-300"
      >
        {title}
      </Link>
      <ul className="space-y-3">
        {items.map((s) => (
          <li key={s.slug}>
            <Link
              to={`${base}/${s.slug}`}
              onClick={onNav}
              className="text-[13px] text-muted-foreground hover:text-foreground transition-all duration-300 tracking-wide inline-block hover:translate-x-1"
            >
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

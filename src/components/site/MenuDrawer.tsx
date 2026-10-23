import { Link } from "@tanstack/react-router";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { BRAND_NAME } from "@/lib/brand";
import { subcategories } from "@/lib/products";
import { useActiveCategories, type CategoryNode } from "@/lib/categories";
import { useAuth } from "@/lib/auth-context";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MenuDrawer({ open, onClose }: Props) {
  const { data: dbCategories = [] } = useActiveCategories();
  const { user, signOut } = useAuth();

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
        className={`fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm transition-opacity duration-500 ${open ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-full max-w-md bg-background shadow-luxe transform transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="flex items-center justify-between px-7 h-16 lg:h-20 border-b border-border/70">
          <Link
            to="/"
            onClick={onClose}
            className="hover:opacity-85 transition-opacity"
          >
            <div className="flex flex-col items-start gap-1">
              <span className="font-brand text-2xl tracking-[0.3em] hover:text-gold transition-colors leading-none">
                {BRAND_NAME}
              </span>
              <span className="text-[9px] tracking-[0.32em] uppercase text-muted-foreground select-none font-sans font-medium">
                NEW YORK
              </span>
            </div>
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="hover:text-gold transition-all duration-300 hover:scale-105"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="h-[calc(100%-5rem)] overflow-y-auto px-7 py-10 space-y-8">
          {categories.length > 0 ? (
            <div className="space-y-6">
              {categories.map((cat) => (
                <SidebarCategoryNode
                  key={cat.id}
                  node={cat}
                  basePath="/shop"
                  onNav={onClose}
                />
              ))}
            </div>
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

            <div className="pt-5 border-t border-border/30 space-y-5">
              {user ? (
                <>
                  <Link
                    to="/account"
                    onClick={onClose}
                    className="block text-sm font-medium tracking-wide text-foreground/80 hover:text-gold transition-colors duration-300"
                  >
                    My Account ({user.email})
                  </Link>
                  <button
                    onClick={() => {
                      signOut();
                      onClose();
                    }}
                    className="block text-sm text-left font-medium tracking-wide text-red-500 hover:text-red-600 transition-colors duration-300"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  to="/account"
                  onClick={onClose}
                  className="block text-sm font-medium tracking-wide text-foreground hover:text-gold transition-colors duration-300"
                >
                  Sign In / Register
                </Link>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function SidebarCategoryNode({
  node,
  basePath,
  depth = 0,
  onNav,
}: {
  node: CategoryNode;
  basePath: string;
  depth?: number;
  onNav: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const currentPath = `${basePath}/${node.slug}`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between py-1 hover:text-gold transition-colors duration-300">
        <Link
          to={currentPath as any}
          onClick={onNav}
          className={`hover:text-gold transition-colors duration-300 ${
            depth === 0
              ? "font-serif text-2xl tracking-wide block mb-1 text-foreground"
              : "text-[13px] text-muted-foreground hover:text-foreground tracking-wide inline-block hover:translate-x-1"
          }`}
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          {node.name}
        </Link>
        {hasChildren && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
            aria-label={`Toggle ${node.name} subcategories`}
            className="p-1.5 hover:bg-neutral/10 rounded transition-colors text-muted-foreground hover:text-foreground"
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4 transition-transform duration-200" />
            ) : (
              <ChevronRight className="h-4 w-4 transition-transform duration-200" />
            )}
          </button>
        )}
      </div>

      {hasChildren && isOpen && (
        <div className="space-y-1 mt-1">
          {node.children.map((child) => (
            <SidebarCategoryNode
              key={child.id}
              node={child}
              basePath={currentPath}
              depth={depth + 1}
              onNav={onNav}
            />
          ))}
        </div>
      )}
    </div>
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
        to={base as any}
        onClick={onNav}
        className="font-serif text-3xl block mb-5 hover:text-gold transition-colors duration-300"
      >
        {title}
      </Link>
      <ul className="space-y-3">
        {items.map((s) => (
          <li key={s.slug}>
            <Link
              to={`${base}/${s.slug}` as any}
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

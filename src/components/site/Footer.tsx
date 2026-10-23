import { Link } from "@tanstack/react-router";
import { Instagram, Facebook, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BRAND_NAME } from "@/lib/brand";
import { useSiteSettings, DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";

export function Footer() {
  const { data: settings } = useSiteSettings();
  const [email, setEmail] = useState("");
  return (
    <footer className="border-t border-border/60 bg-background mt-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 py-16 lg:py-20 grid gap-12 lg:grid-cols-4">
        <div className="space-y-6">
          <Link
            to="/"
            className="hover:opacity-85 transition-opacity inline-block"
          >
            <div className="flex flex-col items-start gap-1.5">
              <span className="font-brand text-3xl tracking-[0.3em] text-foreground hover:text-gold transition-colors duration-300 leading-none">
                {BRAND_NAME}
              </span>
              <span className="text-[10px] tracking-[0.32em] uppercase text-muted-foreground select-none font-sans font-medium">
                NEW YORK
              </span>
            </div>
          </Link>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
            Luxury clothing and jewellery, crafted with timeless elegance from our atelier to your
            wardrobe.
          </p>
          <div className="flex gap-3 text-muted-foreground">
            <a
              href={settings?.instagram_url || DEFAULT_SITE_SETTINGS.instagram_url || "https://instagram.com/anora_ny"}
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
              className="hover:text-gold transition-all duration-300 hover:scale-105"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href={settings?.facebook_url || DEFAULT_SITE_SETTINGS.facebook_url || "#"}
              target="_blank"
              rel="noreferrer"
              aria-label="Facebook"
              className="hover:text-gold transition-all duration-300 hover:scale-105"
            >
              <Facebook className="h-4 w-4" />
            </a>
            <a
              href={settings?.whatsapp_url || DEFAULT_SITE_SETTINGS.whatsapp_url || "https://wa.me/13473256525?text=Hello%20ANORA"}
              target="_blank"
              rel="noreferrer"
              aria-label="WhatsApp"
              className="hover:text-gold transition-all duration-300 hover:scale-105"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          </div>
        </div>

        <FooterCol title="Shop">
          <FLink to="/shop/clothing">Clothing</FLink>
          <FLink to="/shop/jewellery">Jewellery</FLink>
          <FLink to="/shop">New Arrivals</FLink>
          <FLink to="/shop">Best Sellers</FLink>
        </FooterCol>

        <FooterCol title="Information">
          <FLink to="/faqs">FAQs</FLink>
          <FLink to="/returns">Exchange & Returns</FLink>
          <FLink to="/privacy">Privacy Policy</FLink>
          <FLink to="/terms">Terms & Conditions</FLink>
          <FLink to="/contact">Contact Us</FLink>
          <FLink to="/blogs">Blogs</FLink>
        </FooterCol>

        <div>
          <p className="eyebrow mb-4 text-foreground/70">Newsletter</p>
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
            Quiet dispatches from the atelier — new pieces, journal stories, and private previews.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!email) return;
              toast.success("Welcome to ANORA", { description: "Your subscription is confirmed." });
              setEmail("");
            }}
            className="flex border-b border-foreground/30 focus-within:border-gold transition-colors duration-300"
          >
            <label htmlFor="footer-newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="footer-newsletter-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <button
              type="submit"
              className="text-[11px] tracking-[0.32em] uppercase text-foreground/70 hover:text-gold transition-colors duration-300"
            >
              Subscribe
            </button>
          </form>
        </div>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/70 tracking-wide">
          <span>© {BRAND_NAME}. All Rights Reserved.</span>
          <span>Elegance Crafted For Every Moment</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-5 text-foreground/70">{title}</p>
      <ul className="space-y-3">{children}</ul>
    </div>
  );
}

function FLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="text-sm text-muted-foreground hover:text-gold transition-all duration-300 inline-block hover:translate-x-0.5"
      >
        {children}
      </Link>
    </li>
  );
}

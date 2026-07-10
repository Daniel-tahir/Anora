import { Link } from "@tanstack/react-router";
import { Instagram, Facebook, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function Footer() {
  const [email, setEmail] = useState("");
  return (
    <footer className="border-t border-border/60 bg-background mt-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 py-16 lg:py-20 grid gap-12 lg:grid-cols-4">
        <div className="space-y-6">
          <Link
            to="/"
            className="font-serif text-3xl tracking-[0.3em] text-foreground hover:text-gold transition-colors duration-300 inline-block"
          >
            ANORA
          </Link>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
            Luxury clothing and jewellery, crafted with timeless elegance from our atelier to your
            wardrobe.
          </p>
          <div className="flex gap-3 text-muted-foreground">
            <a
              href="https://instagram.com/anora_ny"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
              className="hover:text-gold transition-all duration-300 hover:scale-105"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href="#"
              aria-label="Facebook"
              className="hover:text-gold transition-all duration-300 hover:scale-105"
            >
              <Facebook className="h-4 w-4" />
            </a>
            <a
              href="#"
              aria-label="Pinterest"
              className="hover:text-gold transition-all duration-300 hover:scale-105"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 4.09 2.45 7.6 5.96 9.14-.08-.78-.16-1.97.03-2.82.18-.77 1.17-4.92 1.17-4.92s-.3-.6-.3-1.48c0-1.39.81-2.43 1.81-2.43.85 0 1.27.64 1.27 1.41 0 .86-.55 2.14-.83 3.33-.24 1 .5 1.81 1.48 1.81 1.78 0 3.15-1.88 3.15-4.59 0-2.4-1.72-4.08-4.18-4.08-2.85 0-4.52 2.13-4.52 4.34 0 .86.33 1.78.74 2.28.08.1.09.18.07.28-.07.31-.24 1-.27 1.13-.04.18-.14.22-.33.13-1.21-.56-1.96-2.33-1.96-3.74 0-3.05 2.21-5.85 6.39-5.85 3.35 0 5.96 2.39 5.96 5.59 0 3.34-2.1 6.02-5.02 6.02-.98 0-1.9-.51-2.21-1.11l-.6 2.28c-.22.85-.81 1.91-1.21 2.56.91.28 1.87.43 2.88.43 5.52 0 10-4.48 10-10S17.52 2 12 2z" />
              </svg>
            </a>
            <a
              href="https://wa.me/13473256525?text=Hello%20ANORA"
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
            <input
              type="email"
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
          <span>© ANORA. All Rights Reserved.</span>
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

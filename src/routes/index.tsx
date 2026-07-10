import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import hero from "@/assets/hero.jpg";
import catClothing from "@/assets/cat-clothing.jpg";
import catJewellery from "@/assets/cat-jewellery.jpg";
import p1 from "@/assets/p1.jpg";
import p2 from "@/assets/p2.jpg";
import p3 from "@/assets/p3.jpg";
import p4 from "@/assets/p4.jpg";
import p5 from "@/assets/p5.jpg";
import p6 from "@/assets/p6.jpg";
import { products } from "@/lib/products";
import { ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ANORA — Elegance Crafted For Every Moment" },
      {
        name: "description",
        content:
          "Discover ANORA's atelier of luxury clothing and jewellery — quiet pieces designed to last a lifetime.",
      },
      { property: "og:title", content: "ANORA" },
      {
        property: "og:description",
        content: "Luxury clothing and jewellery, crafted with timeless elegance.",
      },
    ],
  }),
  component: Home,
});

const newItems = products.filter((p) => p.badge === "New");
const bestItems = products.filter((p) => p.badge === "Best Seller");
const unbadged = products.filter((p) => !p.badge);

const displayNew =
  newItems.length >= 3
    ? newItems
    : [...newItems, ...unbadged.slice(0, 3 - newItems.length)].slice(0, 3);

const displayBest =
  bestItems.length >= 3
    ? bestItems
    : [...bestItems, ...unbadged.slice(3 - bestItems.length, 6 - bestItems.length)].slice(0, 3);

const instagramPosts = [
  { img: p1, alt: "Soft Bloom silk dress" },
  { img: p2, alt: "Cashmere coat detail" },
  { img: p3, alt: "Embroidered kaftan" },
  { img: p4, alt: "Solitaire ring" },
  { img: p5, alt: "Pearl earrings" },
  { img: p6, alt: "Diamond necklace" },
];

function Home() {
  const [newsletterEmail, setNewsletterEmail] = useState("");

  return (
    <>
      {/* ─── Hero ─── */}
      <section className="relative h-[90vh] min-h-[640px] overflow-hidden bg-neutral">
        <img
          src={hero}
          alt="ANORA atelier"
          width={1600}
          height={1100}
          className="absolute inset-0 h-full w-full object-cover animate-zoom-in"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/10 via-transparent to-ink/35" />
        <div className="relative h-full flex flex-col items-center justify-center text-center px-6 text-background animate-fade-up">
          <h1 className="font-serif text-[clamp(3.5rem,10vw,8rem)] leading-[0.92] tracking-[0.06em]">
            ANORA
          </h1>
          <div className="mt-4 h-px w-16 bg-gold/60" />
          <p className="mt-6 max-w-md text-sm md:text-base text-background/85 italic font-serif">
            Elegance Crafted For Every Moment.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <Link
              to="/shop/$category"
              params={{ category: "clothing" }}
              className="bg-background text-foreground px-10 py-4 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-all duration-300"
            >
              Shop Clothing
            </Link>
            <Link
              to="/shop/$category"
              params={{ category: "jewellery" }}
              className="border border-background text-background px-10 py-4 text-[11px] tracking-[0.32em] uppercase hover:bg-background hover:text-foreground transition-all duration-300"
            >
              Shop Jewellery
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Marquee ─── */}
      <div className="border-y border-border overflow-hidden py-4 bg-background">
        <div className="flex whitespace-nowrap animate-marquee gap-16 text-[11px] tracking-[0.4em] uppercase text-muted-foreground">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex gap-16 shrink-0">
              <span>Hand Finished in Atelier</span>
              <span className="gold-rule" />
              <span>Lifetime Repair</span>
              <span className="gold-rule" />
              <span>Complimentary Express Shipping</span>
              <span className="gold-rule" />
              <span>Recycled 18k Gold</span>
              <span className="gold-rule" />
              <span>Made to Last</span>
              <span className="gold-rule" />
            </div>
          ))}
        </div>
      </div>

      {/* ─── Featured Categories ─── */}
      <section className="px-5 lg:px-10 py-24 lg:py-32">
        <div className="text-center max-w-xl mx-auto mb-16">
          <span className="eyebrow">The Houses</span>
          <h2 className="mt-4 font-serif text-4xl md:text-5xl">Two atelier traditions</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6 max-w-7xl mx-auto">
          <CategoryCard
            title="Clothing"
            subtitle="Silks, cashmere & ceremonial dress"
            img={catClothing}
            to="/shop/$category"
            params={{ category: "clothing" }}
          />
          <CategoryCard
            title="Jewellery"
            subtitle="Recycled 18k gold, fine stones"
            img={catJewellery}
            to="/shop/$category"
            params={{ category: "jewellery" }}
          />
        </div>
      </section>

      {/* ─── New Arrivals ─── */}
      <section className="px-5 lg:px-10 py-24 lg:py-32 bg-neutral/30">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-14">
            <div>
              <span className="eyebrow">New Arrivals</span>
              <h2 className="mt-3 font-serif text-4xl md:text-5xl">The Spring Edit</h2>
            </div>
            <Link
              to="/shop"
              className="hidden sm:inline text-[11px] tracking-[0.32em] uppercase hover-underline"
            >
              View All
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-14">
            {displayNew.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <div className="mt-12 text-center sm:hidden">
            <Link to="/shop" className="text-[11px] tracking-[0.32em] uppercase hover-underline">
              View All
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Best Sellers ─── */}
      <section className="px-5 lg:px-10 py-24 lg:py-32">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-14">
            <div>
              <span className="eyebrow">Best Sellers</span>
              <h2 className="mt-3 font-serif text-4xl md:text-5xl">Most cherished pieces</h2>
            </div>
            <Link
              to="/shop"
              className="hidden sm:inline text-[11px] tracking-[0.32em] uppercase hover-underline"
            >
              View All
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-14">
            {displayBest.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <div className="mt-12 text-center sm:hidden">
            <Link to="/shop" className="text-[11px] tracking-[0.32em] uppercase hover-underline">
              View All
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Instagram ─── */}
      <section className="bg-neutral/30 py-24 lg:py-32">
        <div className="text-center px-5 mb-14">
          <span className="eyebrow">Follow Us</span>
          <h2 className="mt-4 font-serif text-4xl md:text-5xl">@ANORA</h2>
          <p className="mt-4 text-sm text-muted-foreground max-w-md mx-auto">
            Quiet moments from the atelier, worn in the world.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-0.5 max-w-7xl mx-auto px-5 lg:px-10">
          {instagramPosts.map((post, i) => (
            <a
              key={i}
              href="#"
              aria-label={`View on Instagram: ${post.alt}`}
              className="group relative overflow-hidden aspect-square bg-neutral"
            >
              <img
                src={post.img}
                alt={post.alt}
                loading="lazy"
                className="h-full w-full object-cover transition-all duration-[1200ms] group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/30 transition-all duration-500 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="1.5"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-all duration-500 scale-0 group-hover:scale-100"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ─── Newsletter ─── */}
      <section className="px-5 py-24 lg:py-32">
        <div className="max-w-xl mx-auto text-center">
          <span className="eyebrow">Stay Connected</span>
          <h2 className="mt-4 font-serif text-4xl md:text-5xl">The Journal</h2>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            Quiet dispatches from the atelier — new pieces, stories, and private previews.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newsletterEmail) return;
              toast.success("Welcome to ANORA", { description: "Your subscription is confirmed." });
              setNewsletterEmail("");
            }}
            className="mt-10 flex border-b border-foreground/30 focus-within:border-gold transition-colors duration-300 max-w-xs mx-auto"
          >
            <input
              type="email"
              required
              placeholder="Your email"
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/60 text-center"
            />
            <button
              type="submit"
              className="text-[11px] tracking-[0.32em] uppercase text-foreground/70 hover:text-gold transition-colors duration-300 shrink-0"
            >
              Subscribe
            </button>
          </form>
        </div>
      </section>
    </>
  );
}

function CategoryCard({
  title,
  subtitle,
  img,
  to,
  params,
}: {
  title: string;
  subtitle: string;
  img: string;
  to: string;
  params?: Record<string, string>;
}) {
  const linkProps = params ? { to, params } : { to };
  return (
    <Link
      {...linkProps}
      className="group relative block overflow-hidden bg-neutral aspect-[4/5] md:aspect-[4/5.2]"
    >
      <img
        src={img}
        alt={title}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-8 md:p-12 text-background">
        <span className="eyebrow text-background/80">{subtitle}</span>
        <h3 className="mt-3 font-serif text-4xl md:text-5xl">{title}</h3>
        <span className="mt-6 inline-block text-[11px] tracking-[0.32em] uppercase pb-1 border-b border-background/70 group-hover:border-gold group-hover:text-gold transition-colors">
          Explore
        </span>
      </div>
    </Link>
  );
}

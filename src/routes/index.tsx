import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import hero from "@/assets/hero.webp";
import { useSiteSettings, DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";
import catClothing from "@/assets/cat-clothing.webp";
import catJewellery from "@/assets/cat-jewellery.webp";
import p1 from "@/assets/p1.webp";
import p2 from "@/assets/p2.webp";
import p3 from "@/assets/p3.webp";
import p4 from "@/assets/p4.webp";
import p5 from "@/assets/p5.webp";
import p6 from "@/assets/p6.webp";
import { ProductCard } from "@/components/site/ProductCard";
import { useProductsCatalog, useParentCategories } from "@/lib/products-query";
import { SITE_URL } from "@/lib/config";
import { getProductPriceInfo } from "@/lib/products";
import { ReviewsCarousel } from "@/components/site/ReviewsCarousel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ANORA New York | Luxury Women's Fashion" },
      {
        name: "description",
        content:
          "Discover ANORA's atelier of luxury clothing and jewellery — quiet pieces designed to last a lifetime.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "ANORA New York | Luxury Women's Fashion" },
      {
        property: "og:description",
        content: "Luxury clothing and jewellery, crafted with timeless elegance.",
      },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE_URL}/logo.png` },
      { property: "og:site_name", content: "ANORA" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "ANORA New York | Luxury Women's Fashion" },
      {
        name: "twitter:description",
        content: "Luxury clothing and jewellery, crafted with timeless elegance.",
      },
      { name: "twitter:image", content: `${SITE_URL}/logo.png` },
    ],
    links: [
      { rel: "canonical", href: `${SITE_URL}/` },
      {
        rel: "preload",
        as: "image",
        href: hero,
        fetchPriority: "high",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify([
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "ANORA",
            url: `${SITE_URL}/`,
            logo: `${SITE_URL}/favicon.ico`,
            description:
              "Discover ANORA's atelier of luxury clothing and jewellery — quiet pieces designed to last a lifetime.",
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "ANORA",
            url: `${SITE_URL}/`,
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${SITE_URL}/shop?q={search_term_string}`,
              },
              "query-input": "required name=search_term_string",
            },
          },
        ]),
      },
    ],
  }),
  component: Home,
});

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
  const { data: products = [] } = useProductsCatalog();
  const { data: categories = [] } = useParentCategories();
  const { data: settings } = useSiteSettings();

  // Group products into sections dynamically
  const featuredProducts = useMemo(
    () => products.filter((p) => p.featured === true).slice(0, 4),
    [products],
  );

  const newArrivals = useMemo(() => {
    const list = products.filter((p) => p.is_new === true || p.badge === "New").slice(0, 4);
    return list.length >= 4
      ? list
      : [...list, ...products.filter((p) => !p.badge).slice(0, 4 - list.length)].slice(0, 4);
  }, [products]);

  const bestSellers = useMemo(() => {
    const list = products
      .filter((p) => p.is_best_seller === true || p.badge === "Best Seller")
      .slice(0, 4);
    return list.length >= 4
      ? list
      : [
          ...list,
          ...products.filter((p) => !p.badge).slice(4 - list.length, 8 - list.length),
        ].slice(0, 4);
  }, [products]);

  const saleProducts = useMemo(() => {
    return products.filter((p) => getProductPriceInfo(p).isOnSale).slice(0, 4);
  }, [products]);

  const heroSrc = settings?.hero_image || hero;

  return (
    <>
      <h1 className="sr-only">ANORA New York | Luxury Women's Fashion</h1>
      {/* ─── Hero ─── */}
      <section className="relative h-[90vh] min-h-[640px] overflow-hidden bg-neutral">
        {heroSrc && (
          <img
            src={heroSrc}
            alt="ANORA atelier"
            width={1600}
            height={1100}
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover lg:object-top animate-zoom-in"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink/10 via-transparent to-ink/35" />
        <div className="relative top-[10vh] h-full flex flex-col items-center justify-center text-center px-6 text-background animate-fade-up">
          <p className="max-w-md text-sm md:text-base text-background/85 italic font-serif">
            {settings?.hero_sub_heading || DEFAULT_SITE_SETTINGS.hero_sub_heading}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            {(settings?.hero_button_1_text || DEFAULT_SITE_SETTINGS.hero_button_1_text) && (
              <Link
                to={
                  (settings?.hero_button_1_link ||
                    DEFAULT_SITE_SETTINGS.hero_button_1_link ||
                    "/shop") as any
                }
                className="bg-background text-foreground px-10 py-4 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-all duration-300 text-center"
              >
                {settings?.hero_button_1_text || DEFAULT_SITE_SETTINGS.hero_button_1_text}
              </Link>
            )}
            {(settings?.hero_button_2_text || DEFAULT_SITE_SETTINGS.hero_button_2_text) && (
              <Link
                to={
                  (settings?.hero_button_2_link ||
                    DEFAULT_SITE_SETTINGS.hero_button_2_link ||
                    "/shop") as any
                }
                className="border border-background text-background px-10 py-4 text-[11px] tracking-[0.32em] uppercase hover:bg-background hover:text-foreground transition-all duration-300 text-center"
              >
                {settings?.hero_button_2_text || DEFAULT_SITE_SETTINGS.hero_button_2_text}
              </Link>
            )}
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

      {/* ─── Featured Categories (Collections) ─── */}
      {categories.length > 0 && (
        <section className="px-5 lg:px-10 py-24 lg:py-32">
          <div className="text-center max-w-xl mx-auto mb-16">
            <span className="eyebrow">The Houses</span>
            <h2 className="mt-4 font-serif text-4xl md:text-5xl">Two atelier traditions</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-7xl mx-auto">
            {categories.map((cat) => {
              const fallbackImages: Record<string, string> = {
                clothing: catClothing,
                jewellery: catJewellery,
              };
              return (
                <CategoryCard
                  key={cat.id}
                  title={cat.name}
                  subtitle={cat.description || "Atelier tradition"}
                  img={cat.image_url || fallbackImages[cat.slug] || catClothing}
                  to={`/shop/${cat.slug}`}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Featured Products ─── */}
      {featuredProducts.length > 0 && (
        <section className="px-5 lg:px-10 py-24 lg:py-32 bg-neutral/30 border-y border-border/20">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-14">
              <div>
                <span className="eyebrow">Featured</span>
                <h2 className="mt-3 font-serif text-4xl md:text-5xl">Featured Pieces</h2>
              </div>
              <Link
                to="/shop"
                className="hidden sm:inline text-[11px] tracking-[0.32em] uppercase hover-underline"
              >
                View All
              </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-14">
              {featuredProducts.map((p) => (
                <ProductCard key={p.id} product={p as any} />
              ))}
            </div>
            <div className="mt-12 text-center sm:hidden">
              <Link to="/shop" className="text-[11px] tracking-[0.32em] uppercase hover-underline">
                View All
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── New Arrivals ─── */}
      {newArrivals.length > 0 && (
        <section className="px-5 lg:px-10 py-24 lg:py-32 bg-neutral/10">
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-14">
              {newArrivals.map((p) => (
                <ProductCard key={p.id} product={p as any} />
              ))}
            </div>
            <div className="mt-12 text-center sm:hidden">
              <Link to="/shop" className="text-[11px] tracking-[0.32em] uppercase hover-underline">
                View All
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── Best Sellers ─── */}
      {bestSellers.length > 0 && (
        <section className="px-5 lg:px-10 py-24 lg:py-32 border-t border-border/20">
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-14">
              {bestSellers.map((p) => (
                <ProductCard key={p.id} product={p as any} />
              ))}
            </div>
            <div className="mt-12 text-center sm:hidden">
              <Link to="/shop" className="text-[11px] tracking-[0.32em] uppercase hover-underline">
                View All
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── Sale Section ─── */}
      {saleProducts.length > 0 && (
        <section className="px-5 lg:px-10 py-24 lg:py-32 bg-neutral/10 border-t border-border/20">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-14">
              <div>
                <span className="eyebrow text-gold">Exclusive Offers</span>
                <h2 className="mt-3 font-serif text-4xl md:text-5xl">Selected Pieces</h2>
                <p className="text-muted-foreground text-sm mt-2 max-w-md font-sans">
                  A curated collection of our finest pieces, currently offered at special prices.
                </p>
              </div>
              <Link
                to="/shop/sale"
                className="hidden sm:inline text-[11px] tracking-[0.32em] uppercase hover-underline"
              >
                View All Sale
              </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-14">
              {saleProducts.map((p) => (
                <ProductCard key={p.id} product={p as any} />
              ))}
            </div>
            <div className="mt-12 text-center sm:hidden">
              <Link to="/shop/sale" className="text-[11px] tracking-[0.32em] uppercase hover-underline">
                View All Sale
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── Instagram ─── */}
      <section className="bg-neutral/30 py-24 lg:py-32 border-t border-border/25">
        <div className="text-center px-5 mb-14">
          <span className="eyebrow">Follow Us</span>
          <h2 className="mt-4 font-brand text-4xl md:text-5xl">@ANORA</h2>
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
                decoding="async"
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
                  <line x1="17.5" y1="6.5" transform="rotate(45 17.5 6.5)" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ─── Reviews Carousel ─── */}
      <ReviewsCarousel />

      {/* ─── Newsletter ─── */}
      <section className="px-5 py-24 lg:py-32">
        <div className="max-w-xl mx-auto text-center">
          <span className="eyebrow">Stay Connected</span>
          <h2 className="mt-4 font-serif text-4xl md:text-5xl">The Journal</h2>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            Quiet dispatches from the atelier — new pieces, stories, and private previews.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const email = newsletterEmail.trim().toLowerCase();
              if (!email) return;
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                toast.error("Please enter a valid email address");
                return;
              }
              const { error } = await supabase.from("newsletters").insert({ email, source: "homepage" });
              // 23505 = already subscribed: treat as success so we never reveal who is on the list
              if (error && error.code !== "23505") {
                toast.error("Something went wrong", { description: "Please try again in a moment." });
                return;
              }
              toast.success("Welcome to ANORA", { description: "Your subscription is confirmed." });
              setNewsletterEmail("");
            }}
            className="mt-10 flex border-b border-foreground/30 focus-within:border-gold transition-colors duration-300 max-w-xs mx-auto"
          >
            <label htmlFor="homepage-newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="homepage-newsletter-email"
              name="email"
              type="email"
              autoComplete="email"
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
        decoding="async"
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

import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

function useHomepageReviews(limit = 8) {
  return useQuery({
    queryKey: ["reviews", "homepage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select(`
          id, rating, title, review_text, reviewer_name, is_verified, created_at,
          products (name, slug)
        `)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        review_text: r.review_text,
        reviewer_name: r.reviewer_name,
        is_verified: r.is_verified,
        created_at: r.created_at,
        product_name: r.products?.name || "ANORA Product",
        product_slug: r.products?.slug,
      }));
    },
  });
}

export function ReviewsCarousel() {
  const { data: reviews = [], isLoading } = useHomepageReviews();
  const N = reviews.length;

  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [visibleCards, setVisibleCards] = useState(3);
  const [containerWidth, setContainerWidth] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const startXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef(0);

  const getVisibleCards = () => {
    if (typeof window === "undefined") return 3;
    if (window.innerWidth < 640) return 1;
    if (window.innerWidth < 1024) return 2;
    return 3;
  };

  useEffect(() => {
    if (N <= getVisibleCards()) {
      return;
    }

    const handleResize = () => {
      const k = getVisibleCards();
      setVisibleCards(k);
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    const k = getVisibleCards();
    setCurrentIndex(k);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
    };
  }, [N]);

  const shouldSlider = N > visibleCards;

  const clonedItems = useMemo(() => {
    if (!shouldSlider) return reviews;
    const K = visibleCards;
    return [...reviews.slice(-K), ...reviews, ...reviews.slice(0, K)];
  }, [reviews, visibleCards, shouldSlider]);

  const slideNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev + 1);
  };

  const slidePrev = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev - 1);
  };

  const handleTransitionEnd = () => {
    setIsTransitioning(false);
    if (currentIndex >= N + visibleCards) {
      setCurrentIndex(currentIndex - N);
    } else if (currentIndex < visibleCards) {
      setCurrentIndex(currentIndex + N);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!shouldSlider || isTransitioning) return;
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    isDraggingRef.current = true;
    dragOffsetRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    const touch = e.touches[0];
    const diff = touch.clientX - startXRef.current;
    dragOffsetRef.current = diff;
    setDragOffset(diff);
  };

  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const threshold = containerWidth / 5;
    const offset = dragOffsetRef.current;
    setDragOffset(0);
    dragOffsetRef.current = 0;

    if (offset < -threshold) {
      slideNext();
    } else if (offset > threshold) {
      slidePrev();
    } else {
      setIsTransitioning(true);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!shouldSlider || isTransitioning) return;
    startXRef.current = e.clientX;
    isDraggingRef.current = true;
    dragOffsetRef.current = 0;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const diff = ev.clientX - startXRef.current;
      dragOffsetRef.current = diff;
      setDragOffset(diff);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      const threshold = containerWidth / 5;
      const offset = dragOffsetRef.current;
      setDragOffset(0);
      dragOffsetRef.current = 0;

      if (offset < -threshold) {
        slideNext();
      } else if (offset > threshold) {
        slidePrev();
      } else {
        setIsTransitioning(true);
      }
    };

    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseup", handleMouseUp, { passive: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!shouldSlider) return;
    if (e.key === "ArrowLeft") {
      slidePrev();
    } else if (e.key === "ArrowRight") {
      slideNext();
    }
  };

  if (isLoading || N === 0) return null;

  const baseTranslation = -currentIndex * (100 / clonedItems.length);
  const dragTranslation = containerWidth > 0 ? (dragOffset / containerWidth) * 100 : 0;
  const scaleFactor = clonedItems.length / visibleCards;
  const translateX = baseTranslation + dragTranslation / scaleFactor;

  return (
    <section className="bg-neutral/15 py-24 border-t border-b border-border/10 font-sans">
      <div className="max-w-7xl mx-auto text-center mb-12">
        <span className="eyebrow text-gold">Community Voices</span>
        <h2 className="font-serif text-3xl md:text-4xl mt-3 text-foreground tracking-wide">
          Atelier Stories
        </h2>
      </div>

      <div
        ref={containerRef}
        className="relative group max-w-7xl mx-auto px-5 lg:px-10 overflow-hidden select-none outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {shouldSlider && (
          <>
            <button
              onClick={slidePrev}
              className="absolute left-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full border border-border bg-background/90 flex items-center justify-center hover:bg-foreground hover:text-background transition-all duration-300 shadow-sm focus:outline-none"
              aria-label="Previous reviews"
            >
              <span className="text-lg">‹</span>
            </button>
            <button
              onClick={slideNext}
              className="absolute right-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full border border-border bg-background/90 flex items-center justify-center hover:bg-foreground hover:text-background transition-all duration-300 shadow-sm focus:outline-none"
              aria-label="Next reviews"
            >
              <span className="text-lg">›</span>
            </button>
          </>
        )}

        <div
          ref={trackRef}
          className="flex will-change-transform"
          onTransitionEnd={handleTransitionEnd}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          style={{
            transform: `translate3d(${translateX}%, 0, 0)`,
            transition: isTransitioning
              ? "transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
              : "none",
            width: `${scaleFactor * 100}%`,
          }}
        >
          {clonedItems.map((r, idx) => (
            <div
              key={`${r.id}-clone-${idx}`}
              style={{ width: `${100 / clonedItems.length}%` }}
              className="px-3 sm:px-4 flex-shrink-0"
            >
              <div className="border border-border/40 p-6 sm:p-8 bg-background flex flex-col justify-between h-72">
                <div className="space-y-4">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={cn(
                          "h-3.5 w-3.5",
                          star <= r.rating ? "text-gold fill-gold" : "text-muted-foreground/20 fill-transparent"
                        )}
                      />
                    ))}
                  </div>

                  <p className="text-[13px] text-muted-foreground italic leading-relaxed line-clamp-4">
                    "{r.review_text}"
                  </p>
                </div>

                <div className="border-t border-border/10 pt-4 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-foreground">{r.reviewer_name}</span>
                    {r.is_verified && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-widest text-gold leading-none antialiased">
                        <Check className="h-2.5 w-2.5" />
                        Verified
                      </span>
                    )}
                  </div>
                  {r.product_slug && (
                    <Link
                      to="/product/$slug"
                      params={{ slug: r.product_slug }}
                      className="text-[10px] tracking-wider text-muted-foreground hover:text-gold uppercase font-bold hover:underline"
                    >
                      {r.product_name}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

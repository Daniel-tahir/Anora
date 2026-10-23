import { useEffect, useState } from "react";
import { useRouterState, useLocation } from "@tanstack/react-router";
import { useIsFetching } from "@tanstack/react-query";
import { BRAND_NAME } from "@/lib/brand";

interface BrandLoaderProps {
  isLoading?: boolean;
}

export function BrandLoader({ isLoading }: BrandLoaderProps) {
  const { pathname } = useLocation();
  const routerStatus = useRouterState({ select: (s) => s.status });
  const isRouterPending = routerStatus === "pending";

  const [isBridging, setIsBridging] = useState(false);
  const [initialPageLoaded, setInitialPageLoaded] = useState(false);

  useEffect(() => {
    if (isRouterPending) {
      setIsBridging(true);
    } else {
      const t = setTimeout(() => setIsBridging(false), 150);
      return () => clearTimeout(t);
    }
  }, [isRouterPending]);
  
  // Checks if any primary queries are fetching in the background
  const activeQueriesCount = useIsFetching({
    predicate: (query) => {
      const key = query.queryKey[0];
      const primaryKeys = [
        "products",
        "categories",
        "blogs",
        "orders",
        "wishlist",
        "product-detail",
        "blog-detail",
        "category-products",
        "subcategory-products",
        "active-categories"
      ];
      return primaryKeys.includes(String(key)) && query.state.status === "pending";
    }
  });

  // Loader shows if router transitions are pending, bridging holds, or initial query loads are incomplete.
  const show = !initialPageLoaded && (isRouterPending || isBridging || activeQueriesCount > 0 || isLoading || false);

  const isAdmin = pathname.startsWith("/admin");
  const initialShow = isAdmin ? false : true;
  const [visible, setVisible] = useState(initialShow);
  const [prevShow, setPrevShow] = useState(show);

  // Sync state synchronously during the render phase if show becomes true
  if (show !== prevShow) {
    setPrevShow(show);
    if (show && !isAdmin) {
      setVisible(true);
    }
  }

  useEffect(() => {
    if (!show || isAdmin) {
      const t = setTimeout(() => {
        setVisible(false);
        setInitialPageLoaded(true);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [show, isAdmin]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ease-in-out ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="w-full max-w-[280px] sm:max-w-[320px] px-6 text-foreground">
        <svg
          viewBox="0 0 300 80"
          className="w-full h-auto overflow-visible select-none"
          aria-label={BRAND_NAME}
        >
          <defs>
            {/* Linear Gold Shimmer Gradient */}
            <linearGradient id="shimmer-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
              <stop offset="35%" stopColor="currentColor" stopOpacity="1" />
              <stop offset="50%" stopColor="var(--color-gold)" stopOpacity="1" />
              <stop offset="65%" stopColor="currentColor" stopOpacity="1" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
            </linearGradient>

            {/* Clipping path representing the text content so shimmer only covers the text */}
            <clipPath id="text-clip">
              <text
                x="50%"
                y="55%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="font-brand text-4xl sm:text-5xl tracking-[0.35em]"
              >
                {BRAND_NAME}
              </text>
            </clipPath>

            {/* Vertical fill clip path for text bottom-to-top reveal */}
            <clipPath id="fill-clip">
              <rect
                x="0"
                y="80"
                width="300"
                height="80"
                className="animate-brand-fill"
              />
            </clipPath>
          </defs>

          {/* 1. Behind/Background Outline: very light opacity */}
          <text
            x="50%"
            y="55%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.75"
            className="font-brand text-4xl sm:text-5xl tracking-[0.35em] opacity-10 animate-brand-fade-in"
          >
            {BRAND_NAME}
          </text>

          {/* 2. Drawing Outline: draws around the character edges */}
          <text
            x="50%"
            y="55%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.75"
            className="font-brand text-4xl sm:text-5xl tracking-[0.35em] opacity-40 animate-brand-outline"
          >
            {BRAND_NAME}
          </text>

          {/* 3. Filled Text: clip-masked for bottom-to-top reveal */}
          <g clipPath="url(#fill-clip)">
            {/* Shimmer group: clip-masked to only show on text shape */}
            <g clipPath="url(#text-clip)">
              {/* Solid base fill */}
              <rect x="0" y="0" width="300" height="80" fill="currentColor" />

              {/* Shimmer overlay block moving horizontally */}
              <rect
                x="-300"
                y="0"
                width="300"
                height="80"
                fill="url(#shimmer-grad)"
                className="animate-brand-shimmer opacity-85"
              />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}

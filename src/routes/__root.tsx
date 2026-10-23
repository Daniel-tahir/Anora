import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, useContext, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { StoreProvider } from "@/lib/store";
import { CartContext } from "@/lib/cart-context";
import { AuthProvider } from "@/lib/auth-context";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppButton } from "@/components/site/WhatsAppButton";
import { Toaster } from "@/components/ui/sonner";
import { BrandLoader } from "@/components/common/BrandLoader";
import { PaymentPreloader } from "@/components/common/PaymentPreloader";

function SafeShellWrapper({ children }: { children: ReactNode }) {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) {
    return <>{children}</>;
  }

  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StoreProvider>
          <div className="flex min-h-screen flex-col bg-background text-foreground">
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:bg-background focus:px-4 focus:py-2 focus:border focus:border-gold"
            >
              Skip to content
            </a>
            <Header />
            <main id="main-content" className="flex-1">{children}</main>
            <Footer />
            <Toaster />
          </div>
        </StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function NotFoundComponent() {
  const cartContext = useContext(CartContext);
  const hasShell = cartContext !== null;

  const content = (
    <div className="flex min-h-[70vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="eyebrow">404</p>
        <h2 className="mt-4 font-serif text-4xl">This page is unwritten</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          The page you're looking for has moved or never existed.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-block bg-foreground text-background px-6 py-3 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-colors"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );

  if (hasShell) {
    return content;
  }

  return <SafeShellWrapper>{content}</SafeShellWrapper>;
}

function ErrorComponent({ error: rawError, reset }: { error: unknown; reset: () => void }) {
  const error = rawError instanceof Error ? rawError : new Error(String(rawError));
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const cartContext = useContext(CartContext);
  const hasShell = cartContext !== null;

  const content = (
    <div className="flex min-h-[70vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-3xl">Something went quietly wrong</h1>
        <p className="mt-3 text-sm text-muted-foreground">Please try again, or return home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="bg-foreground text-background px-5 py-2.5 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="border border-foreground px-5 py-2.5 text-[11px] tracking-[0.32em] uppercase hover:bg-foreground hover:text-background transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );

  if (hasShell) {
    return content;
  }

  return <SafeShellWrapper>{content}</SafeShellWrapper>;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ANORA New York | Luxury Women's Fashion" },
      {
        name: "description",
        content:
          "ANORA is a luxury house of clothing and jewellery — quiet, considered pieces crafted in our atelier for every moment of a lifetime.",
      },
      { name: "author", content: "ANORA" },
      { property: "og:title", content: "ANORA New York | Luxury Women's Fashion" },
      {
        property: "og:description",
        content:
          "Luxury clothing and jewellery, crafted with timeless elegance from our atelier to your wardrobe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#ffffff" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      // Font preconnects
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Geist:wght@300;400;500;600;700;800&family=Manrope:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600&family=Stardos+Stencil:wght@400;700&display=swap",
      },
      // Payment SDK preconnects — open TCP+TLS before JS requests them
      { rel: "preconnect", href: "https://js.stripe.com" },
      { rel: "preconnect", href: "https://www.paypal.com" },
      { rel: "preconnect", href: "https://www.paypalobjects.com" },
      { rel: "dns-prefetch", href: "https://js.stripe.com" },
      { rel: "dns-prefetch", href: "https://www.paypal.com" },
      // Supabase API & CDN preconnect
      { rel: "preconnect", href: "https://zqapvgxlnzpmdcwqlfyt.supabase.co", crossOrigin: "" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { useSiteSettings } from "@/lib/site-settings";

function FaviconUpdater() {
  const { data: settings } = useSiteSettings();

  useEffect(() => {
    if (settings?.favicon) {
      const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (link) {
        link.href = settings.favicon;
      }
    }
  }, [settings?.favicon]);

  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");

  return (
    <QueryClientProvider client={queryClient}>
      <FaviconUpdater />
      <AuthProvider>
        <StoreProvider>
          <div className="flex min-h-screen flex-col bg-background text-foreground">
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:bg-background focus:px-4 focus:py-2 focus:border focus:border-gold"
            >
              Skip to content
            </a>
            {!isAdmin && (
              <>
                <Header />
                <WhatsAppButton />
              </>
            )}
            <main id="main-content" className={isAdmin ? "" : "flex-1"}>
              <Outlet />
            </main>
            {!isAdmin && <Footer />}
            <Toaster />
            <BrandLoader />
            <PaymentPreloader />
          </div>
        </StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Heart, Search, ShoppingBag, User, Menu, X, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { useWishlist } from "@/lib/store";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { MenuDrawer } from "./MenuDrawer";
import { SearchDialog } from "./SearchDialog";
import { AccountDropdown } from "./AccountDropdown";
import { BRAND_NAME } from "@/lib/brand";
import { useSiteSettings, DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";

export function Header() {
  const { data: settings } = useSiteSettings();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const cart = useCart();
  const wish = useWishlist();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const currentPath = location.pathname;
  const isHome = currentPath === "/";
  const isCart = currentPath === "/cart";

  const handleLogoClick = (e: React.MouseEvent) => {
    if (isHome) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      e.preventDefault();
      navigate({ to: "/" }).then(() => {
        window.scrollTo({ top: 0 });
      });
    }
  };
  const isAccount = ["/account", "/login", "/register", "/forgot-password"].some((p) =>
    currentPath.startsWith(p)
  );

  const activeTab = 
    menuOpen ? "menu" : 
    searchOpen ? "search" : 
    isCart ? "bag" : 
    isAccount ? "account" : 
    isHome ? "home" : "";

  return (
    <>
      {settings?.announcement_enabled !== false && (
        <div className="bg-ink text-background/90 text-[11px] tracking-[0.32em] uppercase py-2.5 text-center border-b border-gold/10 flex items-center justify-center gap-2 flex-wrap px-4">
          <span>{settings?.announcement_text || DEFAULT_SITE_SETTINGS.announcement_text}</span>
          {settings?.announcement_button_text && settings?.announcement_button_link && (
            <Link
              to={settings.announcement_button_link}
              className="underline text-gold hover:text-gold-light ml-1 font-medium transition-colors"
            >
              {settings.announcement_button_text}
            </Link>
          )}
        </div>
      )}
      <header
        className={`sticky top-0 z-40 w-full bg-background transition-all duration-500 ${
          scrolled ? "border-b border-border/60 shadow-luxe bg-background/90 backdrop-blur-md" : ""
        }`}
      >
        {/* Desktop/Tablet Header Layout */}
        <div className="hidden sm:grid mx-auto grid-cols-3 items-center px-5 lg:px-10 h-16 lg:h-20">
          <div className="flex items-center gap-4">
            <button
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen(true)}
              className="text-foreground hover:text-gold transition-all duration-300 hover:scale-105"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
          <Link
            to="/"
            className="justify-self-center hover:opacity-85 transition-opacity"
            onClick={handleLogoClick}
          >
            {settings?.logo ? (
              <img src={settings.logo} alt={BRAND_NAME} className="h-8 lg:h-9 w-auto object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="font-brand text-2xl lg:text-3xl tracking-[0.35em] text-foreground hover:text-gold transition-colors duration-300 leading-none">
                  {BRAND_NAME}
                </span>
                <span className="text-[9px] tracking-[0.35em] uppercase text-muted-foreground select-none font-sans font-medium">
                  NEW YORK
                </span>
              </div>
            )}
          </Link>
          <div className="flex items-center justify-end gap-4 lg:gap-5 text-foreground">
            <button
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              className="hover:text-gold transition-all duration-300 hover:scale-105"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <Link
              to="/wishlist"
              aria-label="Wishlist"
              className="relative hover:text-gold transition-all duration-300 hover:scale-105"
            >
              <Heart className="h-[18px] w-[18px]" />
              {mounted && wish.count > 0 && (
                <span className="absolute -top-1.5 -right-2 text-[10px] bg-gold text-ink rounded-full h-4 min-w-4 px-1 flex items-center justify-center font-medium">
                  {wish.count}
                </span>
              )}
            </Link>
            <Link
              to="/cart"
              aria-label="Cart"
              className="relative hover:text-gold transition-all duration-300 hover:scale-105"
            >
              <ShoppingBag className="h-[18px] w-[18px]" />
              {mounted && cart.count > 0 && (
                <span className="absolute -top-1.5 -right-2 text-[10px] bg-gold text-ink rounded-full h-4 min-w-4 px-1 flex items-center justify-center font-medium">
                  {cart.count}
                </span>
              )}
            </Link>
            <div className="relative flex items-center">
              {user && !user.is_anonymous ? (
                <>
                  <button
                    onClick={() => setAccountOpen((v) => !v)}
                    aria-label="Account"
                    className="grid place-items-center h-[30px] w-[30px] hover:text-gold transition-all duration-300 hover:scale-105"
                  >
                    <span className="text-[11px] font-serif font-bold tracking-wide">
                      {user.email?.trim()?.[0]?.toUpperCase() ?? "A"}
                    </span>
                  </button>
                  <AccountDropdown open={accountOpen} onClose={() => setAccountOpen(false)} />
                </>
              ) : (
                <Link
                  to="/account"
                  aria-label="Account"
                  className="grid place-items-center h-[30px] w-[30px] hover:text-gold transition-all duration-300 hover:scale-105"
                >
                  <User className="h-[18px] w-[18px]" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Minimal Header Layout */}
        <div className="sm:hidden flex items-center justify-between h-14 px-4 border-b border-border/40 bg-background/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen(true)}
              className="text-foreground hover:text-gold transition-all duration-300"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link
              to="/"
              className="hover:opacity-85 transition-opacity"
              onClick={handleLogoClick}
            >
              {settings?.logo ? (
                <img src={settings.logo} alt={BRAND_NAME} className="h-6 w-auto object-contain" />
              ) : (
                <div className="flex flex-col items-start gap-0.5">
                  <span className="font-brand text-xl tracking-[0.3em] text-foreground hover:text-gold transition-colors duration-300 leading-none">
                    {BRAND_NAME}
                  </span>
                  <span className="text-[8px] tracking-[0.32em] uppercase text-muted-foreground select-none font-sans font-medium">
                    NEW YORK
                  </span>
                </div>
              )}
            </Link>
          </div>

          <div className="flex items-center gap-4 text-foreground">
            <button
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              className="hover:text-gold transition-all duration-300"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <Link
              to="/wishlist"
              aria-label="Wishlist"
              className="relative hover:text-gold transition-all duration-300"
            >
              <Heart className="h-[18px] w-[18px]" />
              {mounted && wish.count > 0 && (
                <span className="absolute -top-1.5 -right-2 text-[9px] bg-gold text-ink rounded-full h-4 min-w-4 px-1 flex items-center justify-center font-medium">
                  {wish.count}
                </span>
              )}
            </Link>
            <Link
              to="/cart"
              aria-label="Cart"
              className="relative hover:text-gold transition-all duration-300"
            >
              <ShoppingBag className="h-[18px] w-[18px]" />
              {mounted && cart.count > 0 && (
                <span className="absolute -top-1.5 -right-2 text-[9px] bg-gold text-ink rounded-full h-4 min-w-4 px-1 flex items-center justify-center font-medium">
                  {cart.count}
                </span>
              )}
            </Link>
            <div className="relative flex items-center">
              {user && !user.is_anonymous ? (
                <>
                  <button
                    onClick={() => setAccountOpen((v) => !v)}
                    aria-label="Account"
                    className="grid place-items-center h-[30px] w-[30px] hover:text-gold transition-all duration-300"
                  >
                    <span className="text-[11px] font-serif font-bold tracking-wide">
                      {user.email?.trim()?.[0]?.toUpperCase() ?? "A"}
                    </span>
                  </button>
                  <AccountDropdown open={accountOpen} onClose={() => setAccountOpen(false)} />
                </>
              ) : (
                <Link
                  to="/account"
                  aria-label="Account"
                  className="grid place-items-center h-[30px] w-[30px] hover:text-gold transition-all duration-300"
                >
                  <User className="h-[18px] w-[18px]" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav id="mobile-nav" aria-label="Mobile navigation">
        <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      </nav>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

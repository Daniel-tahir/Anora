import { Link } from "@tanstack/react-router";
import { Heart, Search, ShoppingBag, User, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useCart, useWishlist } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { MenuDrawer } from "./MenuDrawer";
import { SearchDialog } from "./SearchDialog";
import { AccountDropdown } from "./AccountDropdown";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const cart = useCart();
  const wish = useWishlist();
  const { user } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div className="bg-ink text-background/90 text-[11px] tracking-[0.32em] uppercase py-2.5 text-center border-b border-gold/10">
        Complimentary Express Shipping Worldwide
      </div>
      <header
        className={`sticky top-0 z-40 w-full bg-background transition-all duration-500 ${
          scrolled ? "border-b border-border/60 shadow-luxe bg-background/90 backdrop-blur-md" : ""
        }`}
      >
        <div className="mx-auto grid grid-cols-3 items-center px-5 lg:px-10 h-16 lg:h-20">
          <div className="flex items-center gap-4">
            <button
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
              className="text-foreground hover:text-gold transition-all duration-300 hover:scale-105"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
          <Link
            to="/"
            className="justify-self-center font-serif text-2xl lg:text-3xl tracking-[0.35em] text-foreground hover:text-gold transition-colors duration-300"
          >
            ANORA
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
            <div className="relative hidden sm:block">
              {user ? (
                <>
                  <button
                    onClick={() => setAccountOpen((v) => !v)}
                    aria-label="Account"
                    className="grid place-items-center h-[30px] w-[30px] hover:text-gold transition-all duration-300 hover:scale-105"
                  >
                    <span className="text-[11px] font-serif font-bold tracking-wide">
                      {(user.email ?? "A")[0].toUpperCase()}
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
      </header>
      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-context";
import {
  addToCart,
  addToWishlist,
  clearCart,
  type CartSnapshot,
  getCartSnapshot,
  getWishlistSnapshot,
  initCrossTabSync,
  isInWishlist,
  mergeGuestCartToUser,
  removeFromCart,
  removeFromWishlist,
  searchProducts,
  setCustomerUser,
  syncCartWithServer,
  syncWishlistOnLogin,
  updateCartQuantity,
  validateCartStock,
  subscribe,
} from "./customer-services";

export interface CartItem {
  id: string;
  productId: string;
  variantId?: string | null;
  size: string;
  quantity: number;
  source: "local" | "server";
}

interface CartCtx {
  items: CartItem[];
  add: (productId: string, size: string, quantity?: number, variantId?: string) => void;
  remove: (productId: string, size: string) => void;
  setQty: (productId: string, size: string, quantity: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  detailed: CartSnapshot["detailed"];
  syncCartWithServer: () => Promise<CartItem[]>;
  validateCartStock: () => CartItem[];
}

interface WishCtx {
  ids: string[];
  toggle: (id: string) => void;
  has: (id: string) => boolean;
  remove: (id: string) => void;
  count: number;
  syncWishlistOnLogin: (userId: string) => Promise<string[]>;
  addToWishlist: (id: string) => Promise<void>;
  removeFromWishlist: (id: string) => Promise<void>;
  isInWishlist: (id: string) => boolean;
}

const CartContext = createContext<CartCtx | null>(null);
const WishContext = createContext<WishCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const cartSnapshot = useSyncExternalStore(subscribe, getCartSnapshot, getCartSnapshot);
  const wishSnapshot = useSyncExternalStore(subscribe, getWishlistSnapshot, getWishlistSnapshot);

  useEffect(() => {
    initCrossTabSync();
    setCustomerUser(user?.id ?? null);
    if (!user) return;
    void mergeGuestCartToUser(user.id);
    void syncWishlistOnLogin(user.id);
  }, [user]);

  const cartValue: CartCtx = useMemo(
    () => ({
      items: cartSnapshot.items,
      add: (productId, size, quantity = 1, variantId) =>
        void addToCart(productId, variantId, size, quantity),
      remove: (productId, size) => {
        const item = cartSnapshot.items.find(
          (entry) => entry.productId === productId && entry.size === size,
        );
        if (item) void removeFromCart(item.id);
      },
      setQty: (productId, size, quantity) => {
        const item = cartSnapshot.items.find(
          (entry) => entry.productId === productId && entry.size === size,
        );
        if (item) void updateCartQuantity(item.id, quantity);
      },
      clear: () => {
        void clearCart();
      },
      count: cartSnapshot.count,
      subtotal: cartSnapshot.subtotal,
      detailed: cartSnapshot.detailed,
      syncCartWithServer,
      validateCartStock,
    }),
    [cartSnapshot],
  );

  const wishValue: WishCtx = useMemo(
    () => ({
      ids: wishSnapshot.ids,
      toggle: (id) => {
        if (isInWishlist(id)) void removeFromWishlist(id);
        else void addToWishlist(id);
      },
      has: isInWishlist,
      remove: (id) => void removeFromWishlist(id),
      count: wishSnapshot.ids.length,
      syncWishlistOnLogin,
      addToWishlist: (id) => addToWishlist(id),
      removeFromWishlist: (id) => removeFromWishlist(id),
      isInWishlist,
    }),
    [wishSnapshot],
  );

  return (
    <CartContext.Provider value={cartValue}>
      <WishContext.Provider value={wishValue}>{children}</WishContext.Provider>
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within StoreProvider");
  return ctx;
}

export function useWishlist() {
  const ctx = useContext(WishContext);
  if (!ctx) throw new Error("useWishlist must be used within StoreProvider");
  return ctx;
}

export { searchProducts };

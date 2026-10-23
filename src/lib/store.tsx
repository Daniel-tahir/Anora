import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CartItem, CartCtx, CartContext } from "./cart-context";
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
  getProduct,
} from "./customer-services";

interface WishCtx {
  ids: string[];
  toggle: (id: string, variantId?: string | null) => void;
  has: (id: string, variantId?: string | null) => boolean;
  remove: (id: string, variantId?: string | null) => void;
  count: number;
  syncWishlistOnLogin: (userId: string) => Promise<string[]>;
  addToWishlist: (id: string, variantId?: string | null) => Promise<void>;
  removeFromWishlist: (id: string, variantId?: string | null) => Promise<void>;
  isInWishlist: (id: string, variantId?: string | null) => boolean;
  getProduct: (wishKey: string) => any;
}

export const WishContext = createContext<WishCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const cartSnapshot = useSyncExternalStore(subscribe, getCartSnapshot, getCartSnapshot);
  const wishSnapshot = useSyncExternalStore(subscribe, getWishlistSnapshot, getWishlistSnapshot);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    initCrossTabSync();
    setCustomerUser(user?.id ?? null);
    if (!user) {
      setIsRestoring(false);
      return;
    }

    setIsRestoring(true);
    let active = true;

    async function runRestore() {
      if (!user) return;
      try {
        await mergeGuestCartToUser(user.id);
        await syncWishlistOnLogin(user.id);
      } catch (err) {
        console.error("Cart restoration failed:", err);
      } finally {
        if (active) {
          setIsRestoring(false);
        }
      }
    }

    void runRestore();

    return () => {
      active = false;
    };
  }, [user]);

  const cartValue: CartCtx = useMemo(
    () => ({
      items: cartSnapshot.items,
      add: (productId: string, size: string, quantity = 1, variantId?: string) =>
        void addToCart(productId, variantId, size, quantity),
      remove: (productId: string, size: string, variantId?: string) => {
        const item = cartSnapshot.items.find(
          (entry) => entry.productId === productId && entry.size === size && entry.variantId === (variantId ?? null),
        );
        if (item) void removeFromCart(item.id);
      },
      setQty: (productId: string, size: string, quantity: number, variantId?: string) => {
        const item = cartSnapshot.items.find(
          (entry) => entry.productId === productId && entry.size === size && entry.variantId === (variantId ?? null),
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
      isRestoring: isRestoring || (cartSnapshot.items.length > 0 && cartSnapshot.detailed.some((d) => !d.product || d.product.name === "")),
    }),
    [cartSnapshot, isRestoring],
  );

  const wishValue: WishCtx = useMemo(
    () => ({
      ids: wishSnapshot.ids,
      toggle: (id, variantId) => {
        if (isInWishlist(id, variantId)) void removeFromWishlist(id, variantId);
        else void addToWishlist(id, variantId);
      },
      has: (id, variantId) => isInWishlist(id, variantId),
      remove: (id, variantId) => void removeFromWishlist(id, variantId),
      count: wishSnapshot.ids.length,
      syncWishlistOnLogin,
      addToWishlist: (id, variantId) => addToWishlist(id, variantId),
      removeFromWishlist: (id, variantId) => removeFromWishlist(id, variantId),
      isInWishlist: (id, variantId) => isInWishlist(id, variantId),
      getProduct: (wishKey) => {
        const [productId, variantId] = wishKey.split("|");
        const baseProduct = getProduct(productId);
        if (!baseProduct) return null;
        if (!variantId) return baseProduct;
        
        const variant = baseProduct.colorVariants?.find((v) => v.id === variantId);
        if (!variant) return baseProduct;
        
        return {
          ...baseProduct,
          color: variant.color,
          images: variant.images && variant.images.length > 0 ? variant.images : baseProduct.images,
          price: variant.priceOverride !== undefined ? variant.priceOverride : baseProduct.price,
          compare_price: variant.comparePriceOverride !== undefined ? variant.comparePriceOverride : baseProduct.compare_price,
          sku: variant.sku ?? baseProduct.sku,
          stock: variant.stock,
          sizeStock: variant.sizeStock ?? baseProduct.sizeStock,
          selectedVariantId: variantId,
        };
      },
    }),
    [wishSnapshot],
  );

  return (
    <CartContext.Provider value={cartValue}>
      <WishContext.Provider value={wishValue}>{children}</WishContext.Provider>
    </CartContext.Provider>
  );
}



export function useWishlist() {
  const ctx = useContext(WishContext);
  if (!ctx) throw new Error("useWishlist must be used within StoreProvider");
  return ctx;
}

export { searchProducts };
export { useCart } from "./cart-context";

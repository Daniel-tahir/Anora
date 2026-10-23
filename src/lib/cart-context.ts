import { createContext, useContext } from "react";

export interface CartItem {
  id: string;
  productId: string;
  variantId?: string | null;
  size: string;
  quantity: number;
  source: "local" | "server";
}

export interface CartCtx {
  items: CartItem[];
  add: (productId: string, size: string, quantity?: number, variantId?: string) => void;
  remove: (productId: string, size: string, variantId?: string) => void;
  setQty: (productId: string, size: string, quantity: number, variantId?: string) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  detailed: { item: CartItem; product: any; active: boolean; availableQuantity: number }[];
  syncCartWithServer: () => Promise<CartItem[]>;
  validateCartStock: () => CartItem[] | Promise<CartItem[]>;
  isRestoring: boolean;
}

export const CartContext = createContext<CartCtx | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within StoreProvider");
  return ctx;
}

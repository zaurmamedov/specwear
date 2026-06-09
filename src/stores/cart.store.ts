"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { CartItem } from "@/types/store";

type AddCartItemInput = Omit<CartItem, "quantity"> & {
  quantity?: number;
};

type CartStore = {
  items: CartItem[];
  addItem: (item: AddCartItemInput) => void;
  removeItem: (productId: string, variantId?: string | null) => void;
  setQuantity: (productId: string, quantity: number, variantId?: string | null) => void;
  clearCart: () => void;
  getItemCount: () => number;
  getSubtotal: () => number;
};

function isSameCartItem(
  item: Pick<CartItem, "productId" | "variantId">,
  productId: string,
  variantId?: string | null
) {
  return item.productId === productId && (item.variantId ?? null) === (variantId ?? null);
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) =>
        set((state) => {
          const quantity = item.quantity ?? 1;
          const existingItem = state.items.find((cartItem) =>
            isSameCartItem(cartItem, item.productId, item.variantId)
          );

          if (existingItem) {
            return {
              items: state.items.map((cartItem) =>
                isSameCartItem(cartItem, item.productId, item.variantId)
                  ? { ...cartItem, quantity: cartItem.quantity + quantity }
                  : cartItem
              ),
            };
          }

          return {
            items: [...state.items, { ...item, quantity }],
          };
        }),
      removeItem: (productId, variantId) =>
        set((state) => ({
          items: state.items.filter(
            (item) => !isSameCartItem(item, productId, variantId)
          ),
        })),
      setQuantity: (productId, quantity, variantId) =>
        set((state) => {
          if (quantity <= 0) {
            return {
              items: state.items.filter(
                (item) => !isSameCartItem(item, productId, variantId)
              ),
            };
          }

          return {
            items: state.items.map((item) =>
              isSameCartItem(item, productId, variantId)
                ? { ...item, quantity }
                : item
            ),
          };
        }),
      clearCart: () => set({ items: [] }),
      getItemCount: () =>
        get().items.reduce((total, item) => total + item.quantity, 0),
      getSubtotal: () =>
        get().items.reduce(
          (total, item) => total + (item.price ?? 0) * item.quantity,
          0
        ),
    }),
    {
      name: "specwear-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
    }
  )
);

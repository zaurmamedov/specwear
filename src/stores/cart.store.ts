"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { CHECKOUT_CART_MAX_LINE_QUANTITY } from "@/lib/checkout-validation.shared";
import type { CartItem } from "@/types/store";

type AddCartItemInput = Omit<CartItem, "quantity"> & {
  quantity?: number;
};

type CartStore = {
  items: CartItem[];
  addItem: (item: AddCartItemInput) => void;
  removeItem: (productId: string, variantId?: string | null) => void;
  setQuantity: (productId: string, quantity: number, variantId?: string | null) => void;
  hasItem: (productId: string, variantId?: string | null) => boolean;
  toggleItem: (item: AddCartItemInput) => void;
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

function getItemStockLimit(item: Pick<CartItem, "stockQuantity" | "quantity">) {
  if (typeof item.stockQuantity === "number" && item.stockQuantity > 0) {
    return item.stockQuantity;
  }

  return CHECKOUT_CART_MAX_LINE_QUANTITY;
}

function clampCartQuantity(
  quantity: number,
  item: Pick<CartItem, "stockQuantity" | "quantity">
) {
  return Math.min(Math.max(1, quantity), getItemStockLimit(item));
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) =>
        set((state) => {
          const nextItem = {
            ...item,
            stockQuantity:
              typeof item.stockQuantity === "number" && item.stockQuantity >= 0
                ? item.stockQuantity
                : null,
          };
          const quantity = item.quantity ?? 1;
          const existingItem = state.items.find((cartItem) =>
            isSameCartItem(cartItem, item.productId, item.variantId)
          );

          if (existingItem) {
            const mergedItem = {
              ...existingItem,
              ...nextItem,
            };
            const nextQuantity = clampCartQuantity(
              existingItem.quantity + quantity,
              mergedItem
            );

            return {
              items: state.items.map((cartItem) =>
                isSameCartItem(cartItem, item.productId, item.variantId)
                  ? { ...mergedItem, quantity: nextQuantity }
                  : cartItem
              ),
            };
          }

          const normalizedNewItem = {
            ...nextItem,
            quantity: clampCartQuantity(quantity, {
              stockQuantity: nextItem.stockQuantity ?? null,
              quantity: 1,
            }),
          };

          return {
            items: [...state.items, normalizedNewItem],
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
                ? { ...item, quantity: clampCartQuantity(quantity, item) }
                : item
            ),
          };
        }),
      hasItem: (productId, variantId) =>
        get().items.some((item) => isSameCartItem(item, productId, variantId)),
      toggleItem: (item) => {
        if (get().hasItem(item.productId, item.variantId)) {
          get().removeItem(item.productId, item.variantId);
          return;
        }

        get().addItem(item);
      },
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

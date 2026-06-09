"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { WishlistItem } from "@/types/store";

type WishlistStore = {
  items: WishlistItem[];
  addItem: (item: WishlistItem) => void;
  removeItem: (productId: string, variantId?: string | null) => void;
  toggleItem: (item: WishlistItem) => void;
  clearWishlist: () => void;
  hasItem: (productId: string, variantId?: string | null) => boolean;
};

function isSameWishlistItem(
  item: Pick<WishlistItem, "productId" | "variantId">,
  productId: string,
  variantId?: string | null
) {
  return item.productId === productId && (item.variantId ?? null) === (variantId ?? null);
}

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) =>
        set((state) => {
          if (
            state.items.some((wishlistItem) =>
              isSameWishlistItem(wishlistItem, item.productId, item.variantId)
            )
          ) {
            return state;
          }

          return {
            items: [...state.items, item],
          };
        }),
      removeItem: (productId, variantId) =>
        set((state) => ({
          items: state.items.filter(
            (item) => !isSameWishlistItem(item, productId, variantId)
          ),
        })),
      toggleItem: (item) => {
        if (get().hasItem(item.productId, item.variantId)) {
          get().removeItem(item.productId, item.variantId);
          return;
        }

        get().addItem(item);
      },
      clearWishlist: () => set({ items: [] }),
      hasItem: (productId, variantId) =>
        get().items.some((item) => isSameWishlistItem(item, productId, variantId)),
    }),
    {
      name: "specwear-wishlist",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
    }
  )
);

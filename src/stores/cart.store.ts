"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  CART_QUANTITY_CHECK_FAILED_MESSAGE,
  getCartItemKey,
  requestCartQuantityAvailability,
  sanitizePersistedCartItems,
} from "@/lib/cart-quantity";
import {
  CHECKOUT_CART_MAX_LINE_QUANTITY,
  CHECKOUT_CART_MAX_TOTAL_QUANTITY,
} from "@/lib/checkout-validation.shared";
import type { CartItem } from "@/types/store";

type AddCartItemInput = Omit<CartItem, "quantity"> & {
  quantity?: number;
};

export type CartQuantityMutationResult = {
  ok: boolean;
  message: string | null;
};

type CartQuantityMutationState = {
  isPending: boolean;
  message: string | null;
};

type CartStore = {
  items: CartItem[];
  quantityMutations: Record<string, CartQuantityMutationState>;
  addItem: (item: AddCartItemInput) => Promise<CartQuantityMutationResult>;
  removeItem: (productId: string, variantId?: string | null) => void;
  setQuantity: (
    productId: string,
    quantity: number,
    variantId?: string | null
  ) => Promise<CartQuantityMutationResult>;
  clearQuantityMessage: (productId: string, variantId?: string | null) => void;
  hasItem: (productId: string, variantId?: string | null) => boolean;
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

function invalidQuantityMessage(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return "Кількість має бути цілим числом, не меншим за 1.";
  }

  if (quantity > CHECKOUT_CART_MAX_LINE_QUANTITY) {
    return `Кількість одного товару не може перевищувати ${CHECKOUT_CART_MAX_LINE_QUANTITY}.`;
  }

  return null;
}

function totalQuantityAfterChange(
  items: CartItem[],
  productId: string,
  variantId: string | null | undefined,
  quantity: number
) {
  return items.reduce(
    (total, item) =>
      total +
      (isSameCartItem(item, productId, variantId) ? quantity : item.quantity),
    0
  );
}

function totalQuantityAfterAdd(items: CartItem[], quantity: number) {
  return items.reduce((total, item) => total + item.quantity, 0) + quantity;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => {
      const setMutationState = (
        key: string,
        mutation: CartQuantityMutationState
      ) => {
        set((state) => ({
          quantityMutations: {
            ...state.quantityMutations,
            [key]: mutation,
          },
        }));
      };

      return {
        items: [],
        quantityMutations: {},
        addItem: async (item) => {
          const quantityToAdd = item.quantity ?? 1;
          const quantityError = invalidQuantityMessage(quantityToAdd);
          const key = getCartItemKey(item.productId, item.variantId);

          if (quantityError) {
            setMutationState(key, { isPending: false, message: quantityError });
            return { ok: false, message: quantityError };
          }

          const initialState = get();
          const existingItem = initialState.items.find((cartItem) =>
            isSameCartItem(cartItem, item.productId, item.variantId)
          );
          const desiredQuantity = (existingItem?.quantity ?? 0) + quantityToAdd;
          const desiredError = invalidQuantityMessage(desiredQuantity);

          if (desiredError) {
            setMutationState(key, { isPending: false, message: desiredError });
            return { ok: false, message: desiredError };
          }

          if (initialState.quantityMutations[key]?.isPending) {
            return {
              ok: false,
              message: initialState.quantityMutations[key]?.message ?? null,
            };
          }

          const projectedTotal = existingItem
            ? totalQuantityAfterChange(
                initialState.items,
                item.productId,
                item.variantId,
                desiredQuantity
              )
            : totalQuantityAfterAdd(initialState.items, quantityToAdd);

          if (projectedTotal > CHECKOUT_CART_MAX_TOTAL_QUANTITY) {
            const message = `Загальна кількість товарів не може перевищувати ${CHECKOUT_CART_MAX_TOTAL_QUANTITY}.`;
            setMutationState(key, { isPending: false, message });
            return { ok: false, message };
          }

          setMutationState(key, { isPending: true, message: null });
          const availability = await requestCartQuantityAvailability({
            productId: item.productId,
            variantId: item.variantId,
            quantity: desiredQuantity,
          });

          if (!availability.ok) {
            setMutationState(key, {
              isPending: false,
              message: availability.message ?? CART_QUANTITY_CHECK_FAILED_MESSAGE,
            });
            return availability;
          }

          const latestState = get();
          const latestExistingItem = latestState.items.find((cartItem) =>
            isSameCartItem(cartItem, item.productId, item.variantId)
          );
          const latestDesiredQuantity =
            (latestExistingItem?.quantity ?? 0) + quantityToAdd;
          const latestTotal = latestExistingItem
            ? totalQuantityAfterChange(
                latestState.items,
                item.productId,
                item.variantId,
                latestDesiredQuantity
              )
            : totalQuantityAfterAdd(latestState.items, quantityToAdd);

          if (
            latestDesiredQuantity !== desiredQuantity ||
            latestTotal > CHECKOUT_CART_MAX_TOTAL_QUANTITY
          ) {
            setMutationState(key, {
              isPending: false,
              message: CART_QUANTITY_CHECK_FAILED_MESSAGE,
            });
            return { ok: false, message: CART_QUANTITY_CHECK_FAILED_MESSAGE };
          }

          set((state) => ({
            items: latestExistingItem
              ? state.items.map((cartItem) =>
                  isSameCartItem(cartItem, item.productId, item.variantId)
                    ? { ...cartItem, ...item, quantity: desiredQuantity }
                    : cartItem
                )
              : [...state.items, { ...item, quantity: quantityToAdd }],
            quantityMutations: {
              ...state.quantityMutations,
              [key]: { isPending: false, message: null },
            },
          }));

          return { ok: true, message: null };
        },
        removeItem: (productId, variantId) => {
          const key = getCartItemKey(productId, variantId);
          set((state) => {
            const quantityMutations = { ...state.quantityMutations };
            delete quantityMutations[key];

            return {
              items: state.items.filter(
                (item) => !isSameCartItem(item, productId, variantId)
              ),
              quantityMutations,
            };
          });
        },
        setQuantity: async (productId, quantity, variantId) => {
          const quantityError = invalidQuantityMessage(quantity);
          const key = getCartItemKey(productId, variantId);

          if (quantityError) {
            setMutationState(key, { isPending: false, message: quantityError });
            return { ok: false, message: quantityError };
          }

          const initialState = get();
          const existingItem = initialState.items.find((item) =>
            isSameCartItem(item, productId, variantId)
          );

          if (!existingItem) {
            return { ok: false, message: null };
          }

          if (quantity === existingItem.quantity) {
            setMutationState(key, { isPending: false, message: null });
            return { ok: true, message: null };
          }

          const projectedTotal = totalQuantityAfterChange(
            initialState.items,
            productId,
            variantId,
            quantity
          );

          if (projectedTotal > CHECKOUT_CART_MAX_TOTAL_QUANTITY) {
            const message = `Загальна кількість товарів не може перевищувати ${CHECKOUT_CART_MAX_TOTAL_QUANTITY}.`;
            setMutationState(key, { isPending: false, message });
            return { ok: false, message };
          }

          if (quantity < existingItem.quantity) {
            set((state) => ({
              items: state.items.map((item) =>
                isSameCartItem(item, productId, variantId)
                  ? { ...item, quantity }
                  : item
              ),
              quantityMutations: {
                ...state.quantityMutations,
                [key]: { isPending: false, message: null },
              },
            }));
            return { ok: true, message: null };
          }

          if (initialState.quantityMutations[key]?.isPending) {
            return {
              ok: false,
              message: initialState.quantityMutations[key]?.message ?? null,
            };
          }

          setMutationState(key, { isPending: true, message: null });
          const availability = await requestCartQuantityAvailability({
            productId,
            variantId,
            quantity,
          });

          if (!availability.ok) {
            setMutationState(key, {
              isPending: false,
              message: availability.message ?? CART_QUANTITY_CHECK_FAILED_MESSAGE,
            });
            return availability;
          }

          const latestState = get();
          const latestItem = latestState.items.find((item) =>
            isSameCartItem(item, productId, variantId)
          );

          if (!latestItem || latestItem.quantity !== existingItem.quantity) {
            setMutationState(key, {
              isPending: false,
              message: CART_QUANTITY_CHECK_FAILED_MESSAGE,
            });
            return { ok: false, message: CART_QUANTITY_CHECK_FAILED_MESSAGE };
          }

          set((state) => ({
            items: state.items.map((item) =>
              isSameCartItem(item, productId, variantId)
                ? { ...item, quantity }
                : item
            ),
            quantityMutations: {
              ...state.quantityMutations,
              [key]: { isPending: false, message: null },
            },
          }));

          return { ok: true, message: null };
        },
        clearQuantityMessage: (productId, variantId) => {
          const key = getCartItemKey(productId, variantId);
          set((state) => ({
            quantityMutations: {
              ...state.quantityMutations,
              [key]: {
                isPending: state.quantityMutations[key]?.isPending ?? false,
                message: null,
              },
            },
          }));
        },
        hasItem: (productId, variantId) =>
          get().items.some((item) => isSameCartItem(item, productId, variantId)),
        clearCart: () => set({ items: [], quantityMutations: {} }),
        getItemCount: () =>
          get().items.reduce((total, item) => total + item.quantity, 0),
        getSubtotal: () =>
          get().items.reduce(
            (total, item) => total + (item.price ?? 0) * item.quantity,
            0
          ),
      };
    },
    {
      name: "specwear-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        items: sanitizePersistedCartItems(
          (persistedState as { items?: unknown } | undefined)?.items
        ),
      }),
    }
  )
);

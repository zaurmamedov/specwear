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
  getCartAvailabilitySnapshotKey,
  requestCartAvailability,
} from "@/lib/cart-availability-client";
import {
  CHECKOUT_CART_MAX_LINE_QUANTITY,
  CHECKOUT_CART_MAX_RAW_LINES,
  CHECKOUT_CART_MAX_TOTAL_QUANTITY,
  CHECKOUT_CART_MAX_UNIQUE_LINES,
} from "@/lib/checkout-validation.shared";
import type { CartItem } from "@/types/store";

export type AddCartItemInput = Omit<CartItem, "quantity"> & {
  quantity?: number;
};

export type CartQuantityMutationResult = {
  ok: boolean;
  message: string | null;
  rejectedCount?: number;
};

type CartQuantityMutationState = {
  isPending: boolean;
  message: string | null;
};

type CartStore = {
  items: CartItem[];
  quantityMutations: Record<string, CartQuantityMutationState>;
  addItem: (item: AddCartItemInput) => Promise<CartQuantityMutationResult>;
  addItems: (items: AddCartItemInput[]) => Promise<CartQuantityMutationResult>;
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

function availabilityItems(items: CartItem[]) {
  return items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId ?? null,
    quantity: item.quantity,
  }));
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
          const prospectiveItems = existingItem
            ? initialState.items.map((cartItem) =>
                isSameCartItem(cartItem, item.productId, item.variantId)
                  ? { ...cartItem, ...item, quantity: desiredQuantity }
                  : cartItem
              )
            : [...initialState.items, { ...item, quantity: quantityToAdd }];
          const availability = await requestCartQuantityAvailability({
            productId: item.productId,
            variantId: item.variantId,
            quantity: desiredQuantity,
            cartItems: availabilityItems(prospectiveItems),
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
        addItems: async (incomingItems) => {
          if (
            incomingItems.length === 0 ||
            incomingItems.length > CHECKOUT_CART_MAX_RAW_LINES
          ) {
            const message = `Можна повторити не більше ${CHECKOUT_CART_MAX_RAW_LINES} позицій за один раз.`;
            return { ok: false, message, rejectedCount: incomingItems.length };
          }

          const initialItems = get().items;
          const initialSnapshot = getCartAvailabilitySnapshotKey(
            availabilityItems(initialItems)
          );
          const candidates = new Map<string, CartItem>();

          for (const existing of initialItems) {
            candidates.set(
              getCartItemKey(existing.productId, existing.variantId),
              existing
            );
          }

          const changedKeys = new Set<string>();

          for (const incoming of incomingItems) {
            const quantityToAdd = incoming.quantity ?? 1;
            const quantityError = invalidQuantityMessage(quantityToAdd);

            if (quantityError) {
              return {
                ok: false,
                message: quantityError,
                rejectedCount: incomingItems.length,
              };
            }

            const key = getCartItemKey(incoming.productId, incoming.variantId);
            const existing = candidates.get(key);
            const quantity = (existing?.quantity ?? 0) + quantityToAdd;
            const desiredError = invalidQuantityMessage(quantity);

            if (desiredError) {
              return {
                ok: false,
                message: desiredError,
                rejectedCount: incomingItems.length,
              };
            }

            candidates.set(key, { ...existing, ...incoming, quantity } as CartItem);
            changedKeys.add(key);
          }

          if (candidates.size > CHECKOUT_CART_MAX_UNIQUE_LINES) {
            const message = `У кошику може бути не більше ${CHECKOUT_CART_MAX_UNIQUE_LINES} унікальних позицій.`;
            return { ok: false, message, rejectedCount: incomingItems.length };
          }

          const candidateItems = [...candidates.values()];
          const totalQuantity = candidateItems.reduce(
            (total, item) => total + item.quantity,
            0
          );

          if (totalQuantity > CHECKOUT_CART_MAX_TOTAL_QUANTITY) {
            const message = `Загальна кількість товарів не може перевищувати ${CHECKOUT_CART_MAX_TOTAL_QUANTITY}.`;
            return { ok: false, message, rejectedCount: incomingItems.length };
          }

          let validation;

          try {
            validation = await requestCartAvailability(
              candidateItems
                .filter((item) =>
                  changedKeys.has(getCartItemKey(item.productId, item.variantId))
                )
                .map((item) => ({
                  productId: item.productId,
                  variantId: item.variantId ?? null,
                  quantity: item.quantity,
                }))
            );
          } catch {
            return {
              ok: false,
              message: CART_QUANTITY_CHECK_FAILED_MESSAGE,
              rejectedCount: incomingItems.length,
            };
          }

          if (
            getCartAvailabilitySnapshotKey(availabilityItems(get().items)) !==
            initialSnapshot
          ) {
            return {
              ok: false,
              message: CART_QUANTITY_CHECK_FAILED_MESSAGE,
              rejectedCount: incomingItems.length,
            };
          }

          const acceptedKeys = new Set(
            validation.items
              .filter((item) => item.isAvailable)
              .map((item) => getCartItemKey(item.productId, item.variantId))
          );
          const rejectedCount = [...changedKeys].filter(
            (key) => !acceptedKeys.has(key)
          ).length;

          set((state) => {
            const nextItems = new Map(
              state.items.map((item) => [
                getCartItemKey(item.productId, item.variantId),
                item,
              ])
            );

            for (const key of acceptedKeys) {
              const candidate = candidates.get(key);

              if (candidate) {
                nextItems.set(key, candidate);
              }
            }

            return { items: [...nextItems.values()] };
          });

          return { ok: true, message: null, rejectedCount };
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
          const prospectiveItems = initialState.items.map((item) =>
            isSameCartItem(item, productId, variantId)
              ? { ...item, quantity }
              : item
          );
          const availability = await requestCartQuantityAvailability({
            productId,
            variantId,
            quantity,
            cartItems: availabilityItems(prospectiveItems),
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

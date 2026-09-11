"use client";

import { useEffect, useState } from "react";

import {
  requestCartAvailability,
  type CartAvailabilityResponseItem,
} from "@/lib/cart-availability-client";
import type { CartItem } from "@/types/store";

export const CART_AVAILABILITY_DEBOUNCE_MS = 200;
const EMPTY_AVAILABILITY: CartAvailabilityResponseItem[] = [];

export function useCartAvailability(items: CartItem[]) {
  const [availability, setAvailability] = useState<
    CartAvailabilityResponseItem[]
  >([]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void requestCartAvailability(
        items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? null,
          quantity: item.quantity,
        })),
        { signal: controller.signal }
      )
        .then((payload) => {
          if (!controller.signal.aborted) {
            setAvailability(payload.items);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setAvailability([]);
          }
        });
    }, CART_AVAILABILITY_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [items]);

  return items.length === 0 ? EMPTY_AVAILABILITY : availability;
}

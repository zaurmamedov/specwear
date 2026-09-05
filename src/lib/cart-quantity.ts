import { CHECKOUT_CART_MAX_LINE_QUANTITY } from "./checkout-validation.shared.ts";
import type { CartItem } from "../types/store.ts";

export const CART_QUANTITY_UNAVAILABLE_MESSAGE =
  "Недостатньо товару в наявності для вибраної кількості.";
export const CART_QUANTITY_CHECK_FAILED_MESSAGE =
  "Не вдалося перевірити доступну кількість. Спробуйте ще раз.";

export type CartQuantityCommitResult =
  | { ok: true; quantity: number; draft: string; message: null }
  | { ok: false; quantity: number; draft: string; message: string };

export type CartQuantityAvailabilityResult = {
  ok: boolean;
  message: string | null;
};

type CommitValidatedCartQuantityInput = {
  productId: string;
  variantId?: string | null;
  previousQuantity: number;
  desiredQuantity: number;
  commit: (quantity: number) => void;
};

export function getCartItemKey(productId: string, variantId?: string | null) {
  return `${productId}:${variantId ?? "default"}`;
}

export function getQuantityInputValue(
  draft: string | null,
  committedQuantity: number
) {
  return draft ?? String(committedQuantity);
}

export function parseCartQuantityDraft(
  draft: string,
  previousQuantity: number
): CartQuantityCommitResult {
  const fallback = Number.isSafeInteger(previousQuantity) && previousQuantity > 0
    ? Math.min(previousQuantity, CHECKOUT_CART_MAX_LINE_QUANTITY)
    : 1;
  const normalizedDraft = draft.trim();

  if (normalizedDraft === "") {
    return {
      ok: false,
      quantity: fallback,
      draft: String(fallback),
      message: "Введіть кількість товару.",
    };
  }

  if (!/^\d+$/.test(normalizedDraft)) {
    return {
      ok: false,
      quantity: fallback,
      draft: String(fallback),
      message: "Кількість має бути цілим додатним числом.",
    };
  }

  const quantity = Number(normalizedDraft);

  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return {
      ok: false,
      quantity: fallback,
      draft: String(fallback),
      message: "Кількість має бути не меншою за 1.",
    };
  }

  if (quantity > CHECKOUT_CART_MAX_LINE_QUANTITY) {
    return {
      ok: false,
      quantity: fallback,
      draft: String(fallback),
      message: `Кількість одного товару не може перевищувати ${CHECKOUT_CART_MAX_LINE_QUANTITY}.`,
    };
  }

  return {
    ok: true,
    quantity,
    draft: String(quantity),
    message: null,
  };
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function sanitizePersistedCartItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return [];
    }

    const item = entry as Record<string, unknown>;
    const productId = optionalString(item.productId)?.trim() ?? "";
    const slug = optionalString(item.slug)?.trim() ?? "";
    const name = optionalString(item.name)?.trim() ?? "";

    if (!productId || !slug || !name) {
      return [];
    }

    const rawQuantity = item.quantity;
    const quantity =
      typeof rawQuantity === "number" &&
      Number.isSafeInteger(rawQuantity) &&
      rawQuantity > 0
        ? Math.min(rawQuantity, CHECKOUT_CART_MAX_LINE_QUANTITY)
        : 1;

    return [
      {
        productId,
        variantId: optionalString(item.variantId),
        slug,
        name,
        imageUrl: optionalString(item.imageUrl),
        price: typeof item.price === "number" && Number.isFinite(item.price)
          ? item.price
          : null,
        oldPrice:
          typeof item.oldPrice === "number" && Number.isFinite(item.oldPrice)
            ? item.oldPrice
            : null,
        sku: optionalString(item.sku),
        size: optionalString(item.size),
        color: optionalString(item.color),
        categoryName: optionalString(item.categoryName),
        brandName: optionalString(item.brandName),
        quantity,
      },
    ];
  });
}

export async function requestCartQuantityAvailability(
  input: {
    productId: string;
    variantId?: string | null;
    quantity: number;
  },
  fetcher: typeof fetch = fetch
): Promise<CartQuantityAvailabilityResult> {
  try {
    const response = await fetcher("/api/cart/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            productId: input.productId,
            variantId: input.variantId ?? null,
            quantity: input.quantity,
          },
        ],
      }),
    });

    if (!response.ok) {
      return { ok: false, message: CART_QUANTITY_CHECK_FAILED_MESSAGE };
    }

    const payload = (await response.json()) as {
      items?: Array<{
        productId?: unknown;
        variantId?: unknown;
        isAvailable?: unknown;
        message?: unknown;
      }>;
    };
    const result = payload.items?.find(
      (item) =>
        item.productId === input.productId &&
        (item.variantId ?? null) === (input.variantId ?? null)
    );

    if (!result || typeof result.isAvailable !== "boolean") {
      return { ok: false, message: CART_QUANTITY_CHECK_FAILED_MESSAGE };
    }

    if (!result.isAvailable) {
      return {
        ok: false,
        message:
          typeof result.message === "string" && result.message.trim()
            ? result.message
            : CART_QUANTITY_UNAVAILABLE_MESSAGE,
      };
    }

    return { ok: true, message: null };
  } catch {
    return { ok: false, message: CART_QUANTITY_CHECK_FAILED_MESSAGE };
  }
}

export async function commitValidatedCartQuantity(
  input: CommitValidatedCartQuantityInput,
  fetcher: typeof fetch = fetch
): Promise<CartQuantityAvailabilityResult> {
  const parsed = parseCartQuantityDraft(
    String(input.desiredQuantity),
    input.previousQuantity
  );

  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }

  if (parsed.quantity < input.previousQuantity) {
    input.commit(parsed.quantity);
    return { ok: true, message: null };
  }

  const availability = await requestCartQuantityAvailability(
    {
      productId: input.productId,
      variantId: input.variantId,
      quantity: parsed.quantity,
    },
    fetcher
  );

  if (availability.ok) {
    input.commit(parsed.quantity);
  }

  return availability;
}

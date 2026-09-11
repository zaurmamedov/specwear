export const CART_AVAILABILITY_CONFIRMATION_TTL_MS = 1_500;

const CART_AVAILABILITY_MAX_IN_FLIGHT = 100;
const CART_AVAILABILITY_MAX_CONFIRMATIONS = 100;

export type CartAvailabilityRequestItem = {
  productId: string;
  variantId?: string | null;
  quantity: number;
};

export type CartAvailabilityResponseItem = {
  productId: string;
  variantId: string | null;
  isAvailable: boolean;
  status: "ok" | "unavailable";
  message: string | null;
};

export type CartAvailabilityResponse = {
  items: CartAvailabilityResponseItem[];
  hasUnavailableItems: boolean;
};

type CoordinatorOptions = {
  fetcher?: typeof fetch;
  now?: () => number;
};

function itemKey(item: CartAvailabilityRequestItem) {
  return `${item.productId}:${item.variantId ?? "default"}:${item.quantity}`;
}

export function getCartAvailabilitySnapshotKey(
  items: CartAvailabilityRequestItem[]
) {
  return [...items]
    .map(itemKey)
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

function isResponseItem(value: unknown): value is CartAvailabilityResponseItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.productId === "string" &&
    (typeof item.variantId === "string" || item.variantId === null) &&
    typeof item.isAvailable === "boolean" &&
    (item.status === "ok" || item.status === "unavailable") &&
    item.isAvailable === (item.status === "ok") &&
    (typeof item.message === "string" || item.message === null)
  );
}

function parseResponse(value: unknown): CartAvailabilityResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid cart availability response.");
  }

  const payload = value as Record<string, unknown>;

  if (
    !Array.isArray(payload.items) ||
    !payload.items.every(isResponseItem) ||
    typeof payload.hasUnavailableItems !== "boolean"
  ) {
    throw new Error("Invalid cart availability response.");
  }

  return {
    items: payload.items,
    hasUnavailableItems: payload.hasUnavailableItems,
  };
}

function waitForConsumer<Value>(promise: Promise<Value>, signal?: AbortSignal) {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  }

  return new Promise<Value>((resolve, reject) => {
    const abort = () => {
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    signal.addEventListener("abort", abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

export function createCartAvailabilityCoordinator(
  options: CoordinatorOptions = {}
) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const inFlight = new Map<string, Promise<CartAvailabilityResponse>>();
  const confirmations = new Map<
    string,
    { expiresAt: number; result: CartAvailabilityResponseItem }
  >();

  function getConfirmation(key: string) {
    const confirmation = confirmations.get(key);

    if (!confirmation || confirmation.expiresAt <= now()) {
      confirmations.delete(key);
      return null;
    }

    confirmations.delete(key);
    confirmations.set(key, confirmation);
    return confirmation.result;
  }

  function rememberConfirmation(
    key: string,
    result: CartAvailabilityResponseItem
  ) {
    confirmations.delete(key);

    while (confirmations.size >= CART_AVAILABILITY_MAX_CONFIRMATIONS) {
      const oldestKey = confirmations.keys().next().value;

      if (oldestKey === undefined) {
        break;
      }

      confirmations.delete(oldestKey);
    }

    confirmations.set(key, {
      expiresAt: now() + CART_AVAILABILITY_CONFIRMATION_TTL_MS,
      result,
    });
  }

  function confirmedResponse(items: CartAvailabilityRequestItem[]) {
    const results = items.map((item) => getConfirmation(itemKey(item)));

    if (items.length === 0 || results.some((item) => item === null)) {
      return null;
    }

    return {
      items: results as CartAvailabilityResponseItem[],
      hasUnavailableItems: results.some((item) => !item?.isAvailable),
    };
  }

  return {
    request(
      items: CartAvailabilityRequestItem[],
      options: { signal?: AbortSignal; reuseConfirmation?: boolean } = {}
    ) {
      const reusable = options.reuseConfirmation !== false
        ? confirmedResponse(items)
        : null;

      if (reusable) {
        return Promise.resolve(reusable);
      }

      const key = getCartAvailabilitySnapshotKey(items);
      const existing = inFlight.get(key);

      if (existing) {
        return waitForConsumer(existing, options.signal);
      }

      const cachedResults = new Map<string, CartAvailabilityResponseItem>();
      const missingItems = items.filter((item) => {
        const confirmation = options.reuseConfirmation !== false
          ? getConfirmation(itemKey(item))
          : null;

        if (confirmation) {
          cachedResults.set(itemKey(item), confirmation);
          return false;
        }

        return true;
      });

      const request = fetcher("/api/cart/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: missingItems }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Cart availability request failed.");
          }

          const payload = parseResponse(await response.json());

          for (const requestedItem of missingItems) {
            const result = payload.items.find(
              (item) =>
                item.productId === requestedItem.productId &&
                (item.variantId ?? null) === (requestedItem.variantId ?? null)
            );

            if (!result) {
              throw new Error("Incomplete cart availability response.");
            }

            rememberConfirmation(itemKey(requestedItem), result);
          }

          const combinedItems = items.map((item) => {
            const key = itemKey(item);
            const cached = cachedResults.get(key);

            if (cached) {
              return cached;
            }

            const result = payload.items.find(
              (candidate) =>
                candidate.productId === item.productId &&
                (candidate.variantId ?? null) === (item.variantId ?? null)
            );

            if (!result) {
              throw new Error("Incomplete cart availability response.");
            }

            return result;
          });

          return {
            items: combinedItems,
            hasUnavailableItems: combinedItems.some(
              (item) => !item.isAvailable
            ),
          };
        })
        .finally(() => {
          inFlight.delete(key);
        });

      if (inFlight.size < CART_AVAILABILITY_MAX_IN_FLIGHT) {
        inFlight.set(key, request);
      }

      return waitForConsumer(request, options.signal);
    },
  };
}

const defaultCoordinator = createCartAvailabilityCoordinator();

export function requestCartAvailability(
  items: CartAvailabilityRequestItem[],
  options: { signal?: AbortSignal; reuseConfirmation?: boolean } = {}
) {
  return defaultCoordinator.request(items, options);
}

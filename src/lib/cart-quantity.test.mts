import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  commitValidatedCartQuantity,
  getQuantityInputValue,
  parseCartQuantityDraft,
  requestCartQuantityAvailability,
  sanitizePersistedCartItems,
} from "./cart-quantity.ts";
import {
  CHECKOUT_CART_MAX_LINE_QUANTITY,
  CHECKOUT_CART_MAX_TOTAL_QUANTITY,
} from "./checkout-validation.shared.ts";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const CART_ITEM_SOURCE = source("../components/Cart/CartItem.tsx");
const CART_CLIENT_SOURCE = source("../components/Cart/CartClient.tsx");
const CART_STORE_SOURCE = source("../stores/cart.store.ts");
const QUANTITY_HOOK_SOURCE = source("../hooks/use-quantity-input.ts");
const PRODUCT_CARD_SOURCE = source(
  "../components/ProductCard/ProductCardActions.tsx"
);
const PRODUCT_DETAILS_SOURCE = source(
  "../components/ProductDetails/ProductDetailsActions.tsx"
);
const CHECKOUT_CLIENT_SOURCE = source("../components/Checkout/CheckoutClient.tsx");
const CHECKOUT_VALIDATION_SOURCE = source("./checkout-validation.ts");
const ACCOUNT_SERVICE_SOURCE = source("../services/account.service.ts");
const PUBLIC_PRODUCT_SOURCE = source("../types/product.ts");
const STORE_TYPES_SOURCE = source("../types/store.ts");
const AVAILABILITY_ROUTE_SOURCE = source(
  "../app/api/cart/availability/route.ts"
);

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";

function availabilityFetcher(
  quantity: number,
  isAvailable: boolean,
  message: string | null = null
) {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      items: Array<{ productId: string; variantId: string | null; quantity: number }>;
    };

    assert.deepEqual(body, {
      items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity }],
    });

    return new Response(
      JSON.stringify({
        items: [
          {
            productId: PRODUCT_ID,
            variantId: VARIANT_ID,
            isAvailable,
            message,
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;
}

async function attemptPreCartChange(quantity: number, isAvailable: boolean) {
  let visibleQuantity = 5;
  const result = await commitValidatedCartQuantity(
    {
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      previousQuantity: visibleQuantity,
      desiredQuantity: quantity,
      commit: (approvedQuantity) => {
        visibleQuantity = approvedQuantity;
      },
    },
    availabilityFetcher(quantity, isAvailable, "Товар недоступний у вибраній кількості.")
  );

  return { result, visibleQuantity };
}

test("product details plus uses server-validated commit", async () => {
  assert.match(PRODUCT_DETAILS_SOURCE, /quantityInput\.commitQuantity/);
  assert.deepEqual(await attemptPreCartChange(6, true), {
    result: { ok: true, message: null },
    visibleQuantity: 6,
  });
});

test("product details plus does not visually increment when unavailable", async () => {
  const attempted = await attemptPreCartChange(6, false);
  assert.equal(attempted.result.ok, false);
  assert.equal(attempted.visibleQuantity, 5);
});

test("product card plus uses server-validated commit", () => {
  assert.match(PRODUCT_CARD_SOURCE, /quantityInput\.commitQuantity/);
  assert.match(PRODUCT_CARD_SOURCE, /commitValidatedCartQuantity/);
});

test("product card plus keeps the last quantity after stock rejection", () => {
  assert.match(QUANTITY_HOOK_SOURCE, /draft: getQuantityInputValue\(draft, quantity\)/);
  assert.match(QUANTITY_HOOK_SOURCE, /if \(!result\.ok\)/);
});

test("product details exposes an editable manual quantity input", () => {
  assert.match(PRODUCT_DETAILS_SOURCE, /className=\{styles\.quantityInput\}/);
  assert.match(PRODUCT_DETAILS_SOURCE, /inputMode="numeric"/);
});

test("product card exposes an editable manual quantity input", () => {
  assert.match(PRODUCT_CARD_SOURCE, /className=\{styles\.quantityInput\}/);
  assert.match(PRODUCT_CARD_SOURCE, /inputMode="numeric"/);
});

test("valid manual quantity commits only after server approval", async () => {
  assert.equal((await attemptPreCartChange(20, true)).visibleQuantity, 20);
});

test("unavailable manual quantity is not committed", async () => {
  assert.equal((await attemptPreCartChange(20, false)).visibleQuantity, 5);
});

test("previous valid quantity remains displayed during and after rejection", () => {
  const resetIndex = QUANTITY_HOOK_SOURCE.indexOf("setDraft(null)");
  const awaitIndex = QUANTITY_HOOK_SOURCE.indexOf("await onCommit(desiredQuantity)");
  assert.ok(resetIndex >= 0 && resetIndex < awaitIndex);
});

test("initial non-editing draft reflects the committed quantity", () => {
  assert.equal(getQuantityInputValue(null, 995), "995");
});

test("external decrement updates the visible non-editing value", () => {
  assert.equal(getQuantityInputValue(null, 994), "994");
});

test("external validated increment updates the visible non-editing value", () => {
  assert.equal(getQuantityInputValue(null, 996), "996");
});

test("the exact 995 to 972 regression cannot retain the restored draft", () => {
  const invalid = parseCartQuantityDraft("1001", 995);
  assert.equal(invalid.ok, false);

  const inactiveDraft = null;
  assert.equal(getQuantityInputValue(inactiveDraft, invalid.quantity), "995");
  assert.equal(getQuantityInputValue(inactiveDraft, 972), "972");
});

test("temporary empty draft is preserved only while actively editing", () => {
  assert.equal(getQuantityInputValue("", 995), "");
  assert.equal(getQuantityInputValue(null, 995), "995");
});

test("blur and Enter use the shared commit path", () => {
  assert.match(CART_ITEM_SOURCE, /onBlur=\{\(\) => void quantityInput\.commitDraft\(\)\}/);
  assert.match(CART_ITEM_SOURCE, /event\.key === "Enter"[\s\S]*?\.blur\(\)/);
});

test("Escape restores the authoritative quantity", () => {
  assert.match(CART_ITEM_SOURCE, /event\.key === "Escape"[\s\S]*?quantityInput\.restore\(\)/);
  assert.match(QUANTITY_HOOK_SOURCE, /skipNextDraftCommit\.current = true/);
  assert.match(QUANTITY_HOOK_SOURCE, /restore:[\s\S]*?setDraft\(null\)/);
});

test("temporary empty draft restores the previous valid quantity", () => {
  assert.deepEqual(parseCartQuantityDraft("", 8), {
    ok: false,
    quantity: 8,
    draft: "8",
    message: "Введіть кількість товару.",
  });
});

test("zero never removes a product", () => {
  const result = parseCartQuantityDraft("0", 8);
  assert.equal(result.ok, false);
  assert.equal(result.quantity, 8);
  assert.doesNotMatch(CART_STORE_SOURCE, /if \(quantity <= 0\)[\s\S]*?filter/);
});

test("negative, decimal, exponent, signed and text drafts are rejected", () => {
  for (const draft of ["-1", "1.5", "1e3", "+5", "abc"]) {
    assert.equal(parseCartQuantityDraft(draft, 4).ok, false);
  }
});

test("quantity 100 remains valid", () => {
  assert.equal(parseCartQuantityDraft("100", 1).quantity, 100);
});

test("quantity 999 is valid", () => {
  assert.equal(parseCartQuantityDraft("999", 1).quantity, 999);
});

test("quantity 1000 is the valid per-line maximum", () => {
  assert.equal(CHECKOUT_CART_MAX_LINE_QUANTITY, 1_000);
  assert.equal(parseCartQuantityDraft("1000", 1).quantity, 1_000);
});

test("quantity 1001 is rejected", () => {
  const result = parseCartQuantityDraft("1001", 7);
  assert.equal(result.ok, false);
  assert.equal(result.quantity, 7);
});

test("minus cannot decrement below one", () => {
  assert.match(PRODUCT_CARD_SOURCE, /Math\.max\(1, currentQuantity - 1\)/);
  assert.match(PRODUCT_DETAILS_SOURCE, /Math\.max\(1, effectiveQuantity - 1\)/);
  assert.match(CART_ITEM_SOURCE, /Math\.max\(1, item\.quantity - 1\)/);
});

test("main product actions add an absent variant", () => {
  assert.match(PRODUCT_CARD_SOURCE, /void addCartItem\(\{/);
  assert.match(PRODUCT_DETAILS_SOURCE, /void addCartItem\(\{/);
});

test("main product actions remove an existing variant", () => {
  assert.match(PRODUCT_CARD_SOURCE, /if \(isInCart\)[\s\S]*?removeCartItem/);
  assert.match(PRODUCT_DETAILS_SOURCE, /if \(isInCart\)[\s\S]*?removeCartItem/);
  assert.match(PRODUCT_DETAILS_SOURCE, /isInCart \? "У кошику" : "До кошика"/);
});

test("the add-again state is removed", () => {
  assert.doesNotMatch(PRODUCT_CARD_SOURCE, /Додати ще/);
  assert.doesNotMatch(PRODUCT_DETAILS_SOURCE, /Додати ще/);
});

test("repeated actions preserve one cart line per variant", () => {
  assert.match(CART_STORE_SOURCE, /latestExistingItem[\s\S]*?state\.items\.map/);
  assert.match(CART_STORE_SOURCE, /isSameCartItem/);
});

test("CartItem manual quantity editing remains enabled", () => {
  assert.match(CART_ITEM_SOURCE, /className=\{styles\.quantityInput\}/);
  assert.match(CART_ITEM_SOURCE, /useQuantityInput/);
});

test("CartItem input and cart summary share authoritative store quantities", () => {
  assert.match(CART_ITEM_SOURCE, /quantity: item\.quantity/);
  assert.match(CART_CLIENT_SOURCE, /total \+ item\.quantity/);
});

test("all customer quantity inputs use the shared synchronization model", () => {
  assert.match(CART_ITEM_SOURCE, /useQuantityInput/);
  assert.match(PRODUCT_CARD_SOURCE, /useQuantityInput/);
  assert.match(PRODUCT_DETAILS_SOURCE, /useQuantityInput/);
});

test("stale cart stock still blocks checkout", () => {
  assert.match(CART_CLIENT_SOURCE, /fetch\("\/api\/cart\/availability"/);
  assert.match(CART_CLIENT_SOURCE, /hasUnavailableItems/);
  assert.match(CHECKOUT_CLIENT_SOURCE, /!hasUnavailableCartItems/);
});

test("checkout limit permits one legitimate 1000-unit line", () => {
  assert.equal(CHECKOUT_CART_MAX_TOTAL_QUANTITY, 5_000);
  assert.ok(CHECKOUT_CART_MAX_TOTAL_QUANTITY >= CHECKOUT_CART_MAX_LINE_QUANTITY);
});

test("checkout and availability share the 1000-unit line ceiling", () => {
  assert.match(CART_STORE_SOURCE, /CHECKOUT_CART_MAX_LINE_QUANTITY/);
  assert.match(CHECKOUT_CLIENT_SOURCE, /CHECKOUT_CART_MAX_LINE_QUANTITY/);
});

test("client, cart store and server use the shared 5000-unit total cap", () => {
  assert.equal(CHECKOUT_CART_MAX_TOTAL_QUANTITY, 5_000);
  assert.match(CART_STORE_SOURCE, /CHECKOUT_CART_MAX_TOTAL_QUANTITY/);
  assert.match(CHECKOUT_CLIENT_SOURCE, /CHECKOUT_CART_MAX_TOTAL_QUANTITY/);
  assert.match(CHECKOUT_VALIDATION_SOURCE, /CHECKOUT_CART_MAX_TOTAL_QUANTITY/);
});

test("cart persistence and repeat order retain only the per-line ceiling", () => {
  assert.doesNotMatch(ACCOUNT_SERVICE_SOURCE, /CHECKOUT_CART_MAX_TOTAL_QUANTITY/);
  assert.match(ACCOUNT_SERVICE_SOURCE, /CHECKOUT_CART_MAX_LINE_QUANTITY/);
  assert.equal(
    sanitizePersistedCartItems([
      { productId: PRODUCT_ID, slug: "a", name: "A", quantity: 1_000 },
      { productId: "33333333-3333-4333-8333-333333333333", slug: "b", name: "B", quantity: 1_000 },
    ]).reduce((total, item) => total + item.quantity, 0),
    2_000
  );
});

test("public product and availability DTOs do not expose raw stock", () => {
  const publicVariant =
    PUBLIC_PRODUCT_SOURCE.match(/export interface PublicProductVariant \{[\s\S]*?\n\}/)?.[0] ?? "";
  const publicValidation =
    AVAILABILITY_ROUTE_SOURCE.match(/const publicValidation = validation\.map[\s\S]*?\}\);/)?.[0] ?? "";

  assert.doesNotMatch(publicVariant, /stock_quantity|stockQuantity/);
  assert.doesNotMatch(publicValidation, /stock_quantity|stockQuantity/);
});

test("browser cart persistence strips raw stock", () => {
  const [item] = sanitizePersistedCartItems([
    {
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      slug: "gloves",
      name: "Рукавички",
      price: 100,
      quantity: 1_000,
      stockQuantity: 37,
      stock_quantity: 37,
    },
  ]);

  assert.equal(item.quantity, 1_000);
  assert.equal("stockQuantity" in item, false);
  assert.equal("stock_quantity" in item, false);
  assert.doesNotMatch(STORE_TYPES_SOURCE, /stockQuantity|stock_quantity/);
});

test("pending and request identity guards prevent stale commits", () => {
  assert.match(QUANTITY_HOOK_SOURCE, /if \(pending/);
  assert.match(QUANTITY_HOOK_SOURCE, /requestId\.current !== currentRequestId/);
  assert.match(PRODUCT_DETAILS_SOURCE, /quantityInput\.pending/);
  assert.match(PRODUCT_CARD_SOURCE, /quantityInput\.pending/);
});

test("availability responses contain capability only, never exact stock", async () => {
  const result = await requestCartQuantityAvailability(
    { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 6 },
    availabilityFetcher(6, false)
  );

  assert.deepEqual(result, {
    ok: false,
    message: "Недостатньо товару в наявності для вибраної кількості.",
  });
});

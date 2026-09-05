import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAuthoritativeCheckoutPricing,
  CheckoutPricingError,
  getSafeCheckoutPricingContext,
  type CheckoutCatalogProduct,
  type CheckoutCatalogVariant,
  parseCheckoutCartItems,
} from "./checkout-pricing.ts";

const PRODUCT_A_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_B_ID = "22222222-2222-4222-8222-222222222222";
const VARIANT_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANT_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INACTIVE_VARIANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const retailContext = {
  customerType: "retail" as const,
  isWholesaleApproved: false,
};

test("не надає wholesale-статус відсутньому або неповному профілю", () => {
  assert.deepEqual(getSafeCheckoutPricingContext(null), retailContext);
  assert.deepEqual(
    getSafeCheckoutPricingContext({
      customer_type: "wholesale",
      is_wholesale_approved: false,
    }),
    retailContext
  );
  assert.deepEqual(
    getSafeCheckoutPricingContext({
      customer_type: "legacy-wholesale",
      is_wholesale_approved: true,
    }),
    retailContext
  );
});

test("визнає wholesale лише за явного підтвердження профілю", () => {
  assert.deepEqual(
    getSafeCheckoutPricingContext({
      customer_type: "wholesale",
      is_wholesale_approved: true,
    }),
    {
      customerType: "wholesale",
      isWholesaleApproved: true,
    }
  );
});

function createVariant(
  overrides: Partial<CheckoutCatalogVariant> = {}
): CheckoutCatalogVariant {
  return {
    id: VARIANT_A_ID,
    product_id: PRODUCT_A_ID,
    sku: "SKU-A",
    size: "M",
    color: "Чорний",
    retail_price: 500,
    old_price: null,
    wholesale_price: 350,
    min_wholesale_quantity: 10,
    stock_quantity: 5,
    is_active: true,
    ...overrides,
  };
}

function createProduct(
  overrides: Partial<CheckoutCatalogProduct> = {}
): CheckoutCatalogProduct {
  const variant = createVariant();

  return {
    id: PRODUCT_A_ID,
    name: "Захисна куртка",
    slug: "zakhysna-kurtka",
    status: "active",
    is_active: true,
    main_image_url: "https://example.com/fallback.webp",
    brand_name: "SpecWear",
    category_name: "Куртки",
    product_images: [
      {
        image_url: "https://example.com/main.webp",
        sort_order: 0,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    product_variants: [variant],
    ...overrides,
  };
}

function priceCart(input?: {
  rawItems?: unknown;
  product?: CheckoutCatalogProduct;
  requestedVariants?: CheckoutCatalogVariant[];
}) {
  const items = parseCheckoutCartItems(
    input?.rawItems ?? [
      {
        productId: PRODUCT_A_ID,
        variantId: VARIANT_A_ID,
        quantity: 2,
      },
    ]
  );
  const product = input?.product ?? createProduct();

  return calculateAuthoritativeCheckoutPricing({
    items,
    products: [product],
    requestedVariants:
      input?.requestedVariants ?? [product.product_variants[0]],
    pricingContext: retailContext,
    deliveryPrice: 0,
    discount: 0,
  });
}

test("ігнорує підмінені клієнтські price, subtotal і total", () => {
  const pricing = priceCart({
    rawItems: [
      {
        productId: PRODUCT_A_ID,
        variantId: VARIANT_A_ID,
        quantity: 2,
        price: 1,
        unit_price: 1,
        line_total: 2,
        subtotal: 0,
        total: 0,
      },
    ],
  });

  assert.equal(pricing.items[0].unitPrice, 500);
  assert.equal(pricing.items[0].lineTotal, 1_000);
  assert.equal(pricing.subtotal, 1_000);
  assert.equal(pricing.total, 1_000);
});

test("відхиляє variantId, який належить іншому productId", () => {
  const foreignVariant = createVariant({
    id: VARIANT_B_ID,
    product_id: PRODUCT_B_ID,
  });

  assert.throws(
    () =>
      priceCart({
        rawItems: [
          {
            productId: PRODUCT_A_ID,
            variantId: VARIANT_B_ID,
            quantity: 1,
          },
        ],
        requestedVariants: [foreignVariant],
      }),
    (error) =>
      error instanceof CheckoutPricingError &&
      error.message === "Обраний варіант не належить вказаному товару."
  );
});

test("відхиляє неактивний варіант", () => {
  const inactiveVariant = createVariant({
    id: INACTIVE_VARIANT_ID,
    is_active: false,
  });
  const product = createProduct({
    product_variants: [inactiveVariant],
  });

  assert.throws(
    () =>
      priceCart({
        rawItems: [
          {
            productId: PRODUCT_A_ID,
            variantId: INACTIVE_VARIANT_ID,
            quantity: 1,
          },
        ],
        product,
        requestedVariants: [inactiveVariant],
      }),
    (error) =>
      error instanceof CheckoutPricingError &&
      error.message.includes("більше недоступний")
  );
});

test("відхиляє кількість, що перевищує актуальний stock", () => {
  assert.throws(
    () =>
      priceCart({
        rawItems: [
          {
            productId: PRODUCT_A_ID,
            variantId: VARIANT_A_ID,
            quantity: 6,
          },
        ],
      }),
    (error) =>
      error instanceof CheckoutPricingError &&
      error.message.includes("Недостатньо товару")
  );
});

test("приймає 1000 одиниць за достатнього stock і відхиляє 1001", () => {
  const stockedVariant = createVariant({ stock_quantity: 1_001 });
  const product = createProduct({ product_variants: [stockedVariant] });
  const pricing = priceCart({
    rawItems: [
      { productId: PRODUCT_A_ID, variantId: VARIANT_A_ID, quantity: 1_000 },
    ],
    product,
    requestedVariants: [stockedVariant],
  });

  assert.equal(pricing.items[0].quantity, 1_000);
  assert.throws(
    () =>
      priceCart({
        rawItems: [
          { productId: PRODUCT_A_ID, variantId: VARIANT_A_ID, quantity: 1_001 },
        ],
        product,
        requestedVariants: [stockedVariant],
      }),
    /Кількість одного товару/
  );
});

test("об'єднує дублікати та перевіряє їхню сумарну кількість", () => {
  const pricing = priceCart({
    rawItems: [
      {
        productId: PRODUCT_A_ID,
        variantId: VARIANT_A_ID,
        quantity: 1,
      },
      {
        productId: PRODUCT_A_ID,
        variantId: VARIANT_A_ID,
        quantity: 2,
      },
    ],
  });

  assert.equal(pricing.items.length, 1);
  assert.equal(pricing.items[0].quantity, 3);
  assert.equal(pricing.total, 1_500);
});

test("створює валідний серверний розрахунок і зберігає retail pricing", () => {
  const product = createProduct();
  const pricing = calculateAuthoritativeCheckoutPricing({
    items: parseCheckoutCartItems([
      {
        productId: PRODUCT_A_ID,
        variantId: null,
        quantity: 2,
      },
    ]),
    products: [product],
    requestedVariants: [],
    pricingContext: {
      customerType: "wholesale",
      isWholesaleApproved: true,
    },
    deliveryPrice: 0,
    discount: 0,
  });

  assert.equal(pricing.items[0].variantId, VARIANT_A_ID);
  assert.equal(pricing.items[0].unitPrice, 500);
  assert.equal(pricing.items[0].lineTotal, 1_000);
  assert.deepEqual(
    {
      subtotal: pricing.subtotal,
      deliveryPrice: pricing.deliveryPrice,
      discount: pricing.discount,
      total: pricing.total,
    },
    {
      subtotal: 1_000,
      deliveryPrice: 0,
      discount: 0,
      total: 1_000,
    }
  );
});

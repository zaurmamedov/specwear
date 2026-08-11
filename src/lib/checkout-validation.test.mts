import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createCheckoutRequestFingerprint,
  type CheckoutFingerprintInput,
} from "./checkout-idempotency.ts";
import { calculateAuthoritativeCheckoutPricing } from "./checkout-pricing.ts";
import {
  CHECKOUT_BODY_MAX_BYTES,
  CHECKOUT_COMMENT_MAX_LENGTH,
  CHECKOUT_TURNSTILE_TOKEN_MAX_LENGTH,
} from "./checkout-validation.shared.ts";
import {
  assertValidCheckoutSessionAttempt,
  CHECKOUT_PICKUP_CITY_PLACEHOLDER,
  CheckoutValidationError,
  readCheckoutJsonRequest,
  validateCheckoutInput,
  type NormalizedCheckoutInput,
} from "./checkout-validation.ts";
import {
  buildOrderTelegramMessages,
  deliverOrderTelegramMessages,
  getTelegramParsedTextLength,
  TELEGRAM_ERROR_LOG_MAX_LENGTH,
  TELEGRAM_MESSAGE_SAFE_LENGTH,
  TELEGRAM_ORDER_MAX_PARTS,
  type TelegramOrderNotificationInput,
} from "./telegram-order-message.ts";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CITY_REF = "22222222-2222-4222-8222-222222222222";
const WAREHOUSE_REF = "33333333-3333-4333-8333-333333333333";
const CHECKOUT_ROUTE_SOURCE = readFileSync(
  new URL("../app/api/checkout/orders/route.ts", import.meta.url),
  "utf8"
);

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Іван",
    lastName: "Петренко",
    phone: "+380671234567",
    email: "ivan@example.com",
    deliveryService: "nova_poshta",
    deliveryMethod: "branch",
    deliveryCity: "Київ",
    deliveryCityRef: CITY_REF,
    deliveryWarehouse: "Відділення №1",
    deliveryWarehouseRef: WAREHOUSE_REF,
    deliveryAddress: null,
    comment: null,
    items: [
      {
        productId: PRODUCT_ID,
        variantId: VARIANT_ID,
        quantity: 1,
      },
    ],
    turnstileToken: "test-turnstile-token",
    ...overrides,
  };
}

function expectValidationError(
  callback: () => unknown,
  code: string,
  status = 422
) {
  assert.throws(
    callback,
    (error) =>
      error instanceof CheckoutValidationError &&
      error.code === code &&
      error.httpStatus === status
  );
}

async function expectRequestError(
  request: Request,
  code: string,
  status: number
) {
  await assert.rejects(
    () => readCheckoutJsonRequest(request),
    (error) =>
      error instanceof CheckoutValidationError &&
      error.code === code &&
      error.httpStatus === status
  );
}

test("request parser accepts JSON media type case-insensitively with charset", async () => {
  const request = new Request("https://specwear.test/api/checkout/orders", {
    method: "POST",
    headers: { "Content-Type": "Application/JSON; Charset=UTF-8" },
    body: JSON.stringify({ ok: true }),
  });

  assert.deepEqual(await readCheckoutJsonRequest(request), { ok: true });
});

test("request parser returns controlled errors for content type and malformed bodies", async () => {
  await expectRequestError(
    new Request("https://specwear.test/api/checkout/orders", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    }),
    "CHECKOUT_INVALID_CONTENT_TYPE",
    415
  );
  await expectRequestError(
    new Request("https://specwear.test/api/checkout/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
    "CHECKOUT_INVALID_JSON",
    400
  );
  await expectRequestError(
    new Request("https://specwear.test/api/checkout/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
    "CHECKOUT_INVALID_JSON",
    400
  );
});

test("request parser rejects oversized declared and streamed bodies", async () => {
  await expectRequestError(
    new Request("https://specwear.test/api/checkout/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(CHECKOUT_BODY_MAX_BYTES + 1),
      },
      body: "{}",
    }),
    "CHECKOUT_BODY_TOO_LARGE",
    413
  );
  await expectRequestError(
    new Request("https://specwear.test/api/checkout/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `"${"x".repeat(CHECKOUT_BODY_MAX_BYTES)}"`,
    }),
    "CHECKOUT_BODY_TOO_LARGE",
    413
  );
});

test("checkout route validates before identity, idempotency lookup, and pricing", () => {
  assert.doesNotMatch(CHECKOUT_ROUTE_SOURCE, /request\.json\(\)/);
  const validationIndex = CHECKOUT_ROUTE_SOURCE.indexOf(
    "validateCheckoutInput(parsedBody)"
  );
  const cookiesIndex = CHECKOUT_ROUTE_SOURCE.indexOf("await cookies()");
  const lookupIndex = CHECKOUT_ROUTE_SOURCE.indexOf("lookupCheckoutIdempotency({");
  const pricingIndex = CHECKOUT_ROUTE_SOURCE.indexOf(
    "buildAuthoritativeCheckoutPricing({"
  );

  assert.ok(validationIndex >= 0);
  assert.ok(validationIndex < cookiesIndex);
  assert.ok(validationIndex < lookupIndex);
  assert.ok(validationIndex < pricingIndex);
  assert.match(CHECKOUT_ROUTE_SOURCE, /status: error\.httpStatus/);
});

test("name policy accepts legitimate Ukrainian and international names", () => {
  for (const name of [
    "Іван",
    "Марія-Анна",
    "О’Connor",
    "Jean-Pierre",
    "Zaur Məmmədov",
    "İlham Əliyev",
    "Q",
  ]) {
    const input = validateCheckoutInput(
      createPayload({ firstName: name, lastName: name })
    );
    assert.equal(input.firstName, name.normalize("NFC"));
  }
});

test("name policy rejects non-meaningful and unsafe values", () => {
  for (const name of [
    "",
    "   ",
    "\u200B",
    "123",
    "---",
    "😀",
    "Іван\nІнший",
    "Іван\u0001",
    "Іван\u202E",
    "А".repeat(101),
  ]) {
    expectValidationError(
      () => validateCheckoutInput(createPayload({ firstName: name })),
      "CHECKOUT_VALIDATION_FAILED"
    );
  }
});

test("phone policy normalizes practical Ukrainian formats", () => {
  for (const phone of [
    "+380671234567",
    "380671234567",
    "0671234567",
    "+38 (067) 123-45-67",
    "067 123 45 67",
  ]) {
    assert.equal(
      validateCheckoutInput(createPayload({ phone })).phone,
      "+380671234567"
    );
  }
});

test("phone policy rejects invalid, foreign, extended, and oversized values", () => {
  for (const phone of [
    "abc",
    "+48123456789",
    "+38067",
    "+3806712345678",
    "++380671234567",
    "+380671234567 ext 1",
    "+38067123\n4567",
    "0".repeat(33),
  ]) {
    expectValidationError(
      () => validateCheckoutInput(createPayload({ phone })),
      "CHECKOUT_INVALID_PHONE"
    );
  }
});

test("optional email normalizes its domain and preserves plus addressing", () => {
  for (const email of [undefined, null, "", "   "]) {
    assert.equal(validateCheckoutInput(createPayload({ email })).email, null);
  }

  assert.equal(
    validateCheckoutInput(
      createPayload({ email: "User+work@EXAMPLE.COM" })
    ).email,
    "User+work@example.com"
  );
});

test("email rejects malformed, whitespace, control, and oversized values", () => {
  for (const email of [
    "bad",
    "a@@example.com",
    "a b@example.com",
    "a@example.com\r\nBcc:x@example.com",
    `${"a".repeat(250)}@example.com`,
  ]) {
    expectValidationError(
      () => validateCheckoutInput(createPayload({ email })),
      "CHECKOUT_INVALID_EMAIL"
    );
  }
});

test("delivery matrix accepts every supported combination", () => {
  const cases = [
    createPayload(),
    createPayload({ deliveryMethod: "locker" }),
    createPayload({
      deliveryMethod: "courier",
      deliveryWarehouse: "stale",
      deliveryWarehouseRef: WAREHOUSE_REF,
      deliveryAddress: "вул. Хрещатик, 1",
    }),
    createPayload({
      deliveryService: "ukrposhta",
      deliveryMethod: "branch",
      deliveryCityRef: CITY_REF,
      deliveryWarehouseRef: WAREHOUSE_REF,
    }),
    createPayload({
      deliveryService: "ukrposhta",
      deliveryMethod: "locker",
      deliveryCityRef: CITY_REF,
      deliveryWarehouseRef: WAREHOUSE_REF,
    }),
    createPayload({
      deliveryService: "pickup",
      deliveryMethod: "pickup",
      deliveryCity: null,
      deliveryCityRef: CITY_REF,
      deliveryWarehouse: null,
      deliveryWarehouseRef: WAREHOUSE_REF,
      deliveryAddress: "browser-supplied stale address",
    }),
  ];

  for (const payload of cases) {
    const delivery = validateCheckoutInput(payload);
    assert.ok(delivery.deliveryCity);
  }

  const courier = validateCheckoutInput(cases[2]);
  assert.equal(courier.deliveryWarehouse, null);
  assert.equal(courier.deliveryWarehouseRef, null);
  const ukrposhta = validateCheckoutInput(cases[3]);
  assert.equal(ukrposhta.deliveryCityRef, null);
  assert.equal(ukrposhta.deliveryWarehouseRef, null);
  const pickup = validateCheckoutInput(cases[5]);
  assert.equal(pickup.deliveryCity, CHECKOUT_PICKUP_CITY_PLACEHOLDER);
  assert.equal(pickup.deliveryCityRef, null);
  assert.equal(pickup.deliveryWarehouse, null);
  assert.equal(pickup.deliveryWarehouseRef, null);
  assert.equal(pickup.deliveryAddress, null);
});

test("delivery matrix rejects unknown, unsupported, missing, and malformed data", () => {
  const invalidPayloads = [
    createPayload({ deliveryService: "other" }),
    createPayload({ deliveryMethod: "other" }),
    createPayload({ deliveryService: "pickup", deliveryMethod: "branch" }),
    createPayload({ deliveryWarehouse: null }),
    createPayload({ deliveryCityRef: null }),
    createPayload({ deliveryWarehouseRef: null }),
    createPayload({ deliveryCityRef: "not-a-ref" }),
    createPayload({
      deliveryMethod: "courier",
      deliveryAddress: null,
    }),
    createPayload({
      deliveryService: "ukrposhta",
      deliveryMethod: "branch",
      deliveryWarehouse: null,
    }),
    createPayload({ deliveryCity: "К".repeat(121) }),
    createPayload({ deliveryWarehouse: "В".repeat(301) }),
    createPayload({
      deliveryMethod: "courier",
      deliveryAddress: "А".repeat(501),
    }),
    createPayload({ deliveryCity: "Київ\nЛьвів" }),
    createPayload({ deliveryWarehouse: "Відділення\u202E1" }),
    createPayload({ deliveryWarehouseRef: CITY_REF }),
  ];

  for (const payload of invalidPayloads) {
    expectValidationError(
      () => validateCheckoutInput(payload),
      "CHECKOUT_INVALID_DELIVERY"
    );
  }
});

test("comment supports plain multiline content and normalizes line endings", () => {
  const input = validateCheckoutInput(
    createPayload({ comment: "  Рядок 1\r\nРядок 2\r😀 <b>текст</b>  " })
  );

  assert.equal(input.comment, "Рядок 1\nРядок 2\n😀 <b>текст</b>");
  assert.equal(validateCheckoutInput(createPayload({ comment: "  " })).comment, null);
});

test("comment rejects controls, bidi overrides, objects, and excessive length", () => {
  for (const comment of ["текст\u0001", "текст\u202E", { text: "ні" }]) {
    expectValidationError(
      () => validateCheckoutInput(createPayload({ comment })),
      "CHECKOUT_VALIDATION_FAILED"
    );
  }
  expectValidationError(
    () =>
      validateCheckoutInput(
        createPayload({ comment: "а".repeat(CHECKOUT_COMMENT_MAX_LENGTH + 1) })
      ),
    "CHECKOUT_COMMENT_TOO_LONG"
  );
});

function createCartLines(count: number, quantity = 1) {
  return Array.from({ length: count }, (_, index) => ({
    productId: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    variantId: `10000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    quantity,
  }));
}

test("cart accepts 50 lines and rejects line, quantity, and aggregate limits", () => {
  assert.equal(
    validateCheckoutInput(createPayload({ items: createCartLines(50) })).items
      .length,
    50
  );
  expectValidationError(
    () => validateCheckoutInput(createPayload({ items: createCartLines(51) })),
    "CHECKOUT_CART_LIMIT_EXCEEDED"
  );
  expectValidationError(
    () =>
      validateCheckoutInput(
        createPayload({ items: createCartLines(1, 101) })
      ),
    "CHECKOUT_CART_LIMIT_EXCEEDED"
  );
  expectValidationError(
    () =>
      validateCheckoutInput(
        createPayload({ items: createCartLines(3, 67) })
      ),
    "CHECKOUT_CART_LIMIT_EXCEEDED"
  );
  expectValidationError(
    () =>
      validateCheckoutInput(
        createPayload({ items: createCartLines(1, Number.MAX_SAFE_INTEGER) })
      ),
    "CHECKOUT_CART_LIMIT_EXCEEDED"
  );
});

test("cart merges duplicates and canonicalizes UUID case before fingerprinting", () => {
  const input = validateCheckoutInput(
    createPayload({
      items: [
        { productId: PRODUCT_ID.toUpperCase(), variantId: VARIANT_ID, quantity: 2 },
        { productId: PRODUCT_ID, variantId: VARIANT_ID.toUpperCase(), quantity: 3 },
      ],
    })
  );

  assert.deepEqual(input.items, [
    { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 5 },
  ]);
});

test("resolved explicit and implicit variant lines cannot bypass the per-line cap", () => {
  const normalized = validateCheckoutInput(
    createPayload({
      items: [
        { productId: PRODUCT_ID, variantId: null, quantity: 60 },
        { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 60 },
      ],
    })
  );

  assert.throws(
    () => {
      const product = {
        id: PRODUCT_ID,
        name: "Товар",
        slug: "tovar",
        status: "active",
        is_active: true,
        main_image_url: null,
        brand_name: null,
        category_name: null,
        product_images: [],
        product_variants: [
          {
            id: VARIANT_ID,
            product_id: PRODUCT_ID,
            sku: null,
            size: null,
            color: null,
            retail_price: 1,
            old_price: null,
            wholesale_price: null,
            min_wholesale_quantity: null,
            stock_quantity: 200,
            is_active: true,
          },
        ],
      };

      return calculateAuthoritativeCheckoutPricing({
        items: normalized.items,
        products: [product],
        requestedVariants: product.product_variants,
        pricingContext: { customerType: "retail", isWholesaleApproved: false },
      });
    },
    /Кількість одного товару/
  );
});

test("oversized Turnstile tokens are rejected before provider verification", () => {
  expectValidationError(
    () =>
      validateCheckoutInput(
        createPayload({
          turnstileToken: "x".repeat(CHECKOUT_TURNSTILE_TOKEN_MAX_LENGTH + 1),
        })
      ),
    "CHECKOUT_VALIDATION_FAILED"
  );
});

test("session policy preserves guests and rejects an invalid attempted login", () => {
  assert.doesNotThrow(() => assertValidCheckoutSessionAttempt(false, false));
  assert.doesNotThrow(() => assertValidCheckoutSessionAttempt(true, true));
  expectValidationError(
    () => assertValidCheckoutSessionAttempt(true, false),
    "CHECKOUT_SESSION_INVALID",
    401
  );
});

function fingerprint(input: NormalizedCheckoutInput) {
  const fingerprintInput: CheckoutFingerprintInput = {
    userId: null,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    email: input.email,
    deliveryService: input.deliveryService,
    deliveryMethod: input.deliveryMethod,
    deliveryCity: input.deliveryCity,
    deliveryCityRef: input.deliveryCityRef,
    deliveryWarehouse: input.deliveryWarehouse,
    deliveryWarehouseRef: input.deliveryWarehouseRef,
    deliveryAddress: input.deliveryAddress,
    comment: input.comment,
    items: input.items,
  };

  return createCheckoutRequestFingerprint(fingerprintInput);
}

test("validated semantic equivalents produce a stable fingerprint", () => {
  const canonical = validateCheckoutInput(createPayload());
  const formatted = validateCheckoutInput(
    createPayload({
      firstName: "  Іван  ",
      lastName: "  Петренко  ",
      phone: "+38 (067) 123-45-67",
      email: "ivan@EXAMPLE.COM",
      items: [
        {
          productId: PRODUCT_ID.toUpperCase(),
          variantId: VARIANT_ID.toUpperCase(),
          quantity: 1,
        },
      ],
    })
  );

  assert.equal(fingerprint(canonical), fingerprint(formatted));
  assert.notEqual(
    fingerprint(canonical),
    fingerprint(
      validateCheckoutInput(
        createPayload({ deliveryWarehouse: "Відділення №2" })
      )
    )
  );

  const emptyOptionals = validateCheckoutInput(
    createPayload({ email: " ", comment: " " })
  );
  const nullOptionals = validateCheckoutInput(
    createPayload({ email: null, comment: null })
  );
  assert.equal(fingerprint(emptyOptionals), fingerprint(nullOptionals));
});

function createTelegramInput(
  overrides: Partial<TelegramOrderNotificationInput> = {}
): TelegramOrderNotificationInput {
  return {
    orderId: "44444444-4444-4444-8444-444444444444",
    firstName: "Іван <script>",
    lastName: "Петренко & Co",
    phone: "+380671234567",
    email: "ivan@example.com",
    deliveryService: "nova_poshta",
    deliveryMethod: "branch",
    deliveryCity: "Київ",
    deliveryWarehouse: "Відділення №1",
    deliveryAddress: null,
    subtotal: 1_000,
    deliveryPrice: 0,
    discount: 0,
    total: 1_000,
    items: [{ productName: "Куртка <b>", quantity: 1, price: 1_000 }],
    ...overrides,
  };
}

test("Telegram messages remain escaped, bounded, and preserve critical fields", () => {
  const input = createTelegramInput({
    items: Array.from({ length: 50 }, (_, index) => ({
      productName: `${index} ${"Дуже довга назва & <товар> ".repeat(20)}`,
      quantity: 1,
      price: 1_000,
    })),
  });
  const messages = buildOrderTelegramMessages(input);

  assert.ok(messages.length > 1);
  assert.ok(messages.length <= TELEGRAM_ORDER_MAX_PARTS);
  assert.ok(
    messages.every(
      (message) =>
        getTelegramParsedTextLength(message) <= TELEGRAM_MESSAGE_SAFE_LENGTH
    )
  );
  assert.ok(messages.every((message) => message.includes(input.orderId)));
  assert.match(messages[0], /\+380671234567/);
  assert.match(messages[0], /<b>Разом:/);
  assert.doesNotMatch(messages.join("\n"), /<script>/);
  assert.match(messages.join("\n"), /&lt;script&gt;/);
});

test("pickup Telegram message has one clean delivery label and no fake city block", () => {
  const [message] = buildOrderTelegramMessages(
    createTelegramInput({
      deliveryService: "pickup",
      deliveryMethod: "pickup",
      deliveryCity: CHECKOUT_PICKUP_CITY_PLACEHOLDER,
      deliveryWarehouse: null,
      deliveryAddress: null,
    })
  );

  assert.match(message, /🚚 <b>Доставка:<\/b>\nСамовивіз/);
  assert.doesNotMatch(message, /🏙 <b>Місто:/);
  assert.doesNotMatch(message, /Відділення: —/);
});

test("Telegram provider failures remain non-critical and logs are bounded", async () => {
  const details: unknown[] = [];
  await deliverOrderTelegramMessages(
    buildOrderTelegramMessages(createTelegramInput()),
    { token: "secret-token", chatId: "chat" },
    {
      fetcher: async () => new Response("x".repeat(2_000), { status: 500 }),
      logError: (_message, detail) => details.push(detail),
    }
  );

  assert.equal(typeof details[0], "string");
  assert.equal((details[0] as string).length, TELEGRAM_ERROR_LOG_MAX_LENGTH);

  await assert.doesNotReject(() =>
    deliverOrderTelegramMessages(
      ["message"],
      { token: "secret-token", chatId: "chat" },
      {
        fetcher: async () => {
          throw new Error("network failure");
        },
        logError: () => undefined,
      }
    )
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createCartAvailabilityCoordinator,
} from "./cart-availability-client.ts";
import { handleCartAvailabilityRequest } from "./cart-availability-handler.ts";
import {
  handleNovaPoshtaCitiesRequest,
  handleNovaPoshtaWarehousesRequest,
  NOVA_POSHTA_UNAVAILABLE_MESSAGE,
} from "./nova-poshta-handlers.ts";
import {
  createNovaPoshtaClient,
  NOVA_POSHTA_TIMEOUT_MS,
  NovaPoshtaUnavailableError,
  toPublicNovaPoshtaCities,
  toPublicNovaPoshtaWarehouses,
} from "./nova-poshta.ts";
import {
  AVAILABILITY_BODY_MAX_BYTES,
  normalizeNovaPoshtaQuery,
  normalizeNovaPoshtaRef,
  normalizeNovaPoshtaWarehouseType,
  PublicApiValidationError,
} from "./public-api-validation.ts";
import { isNovaPoshtaWarehouseQueryEligible } from "./nova-poshta-query.shared.ts";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const CITY_REF = "22222222-2222-4222-8222-222222222222";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function availabilityRequest(body: string, contentType = "application/json") {
  return new Request("http://localhost/api/cart/availability", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

function validItem(overrides: Record<string, unknown> = {}) {
  return { productId: PRODUCT_ID, variantId: null, quantity: 1, ...overrides };
}

test("Nova city query normalization enforces Unicode and byte bounds", () => {
  assert.throws(() => normalizeNovaPoshtaQuery(null), PublicApiValidationError);
  assert.throws(() => normalizeNovaPoshtaQuery("а"), PublicApiValidationError);
  assert.equal(normalizeNovaPoshtaQuery("  Ки  "), "Ки");
  assert.equal(normalizeNovaPoshtaQuery("Ки\u0308"), "Кӥ");
  assert.throws(() => normalizeNovaPoshtaQuery("а".repeat(121)), PublicApiValidationError);
  assert.throws(() => normalizeNovaPoshtaQuery(`Ки\nїв`), PublicApiValidationError);
  assert.throws(() => normalizeNovaPoshtaQuery(`Ки\u202eїв`), PublicApiValidationError);
  assert.throws(() => normalizeNovaPoshtaQuery("😀".repeat(120)), PublicApiValidationError);
});

test("warehouse input accepts an empty query but validates non-empty input and cityRef", () => {
  assert.equal(normalizeNovaPoshtaQuery("", { allowEmpty: true }), "");
  for (const query of ["2", "6", "12", "№6", "ві"]) {
    assert.equal(
      normalizeNovaPoshtaQuery(query, {
        allowEmpty: true,
        allowSingleDigit: true,
      }),
      query
    );
  }
  assert.throws(
    () => normalizeNovaPoshtaQuery("в", {
      allowEmpty: true,
      allowSingleDigit: true,
    }),
    PublicApiValidationError
  );
  assert.equal(normalizeNovaPoshtaQuery("  12  ", { allowEmpty: true }), "12");
  assert.throws(() => normalizeNovaPoshtaQuery("а".repeat(121), { allowEmpty: true }));
  assert.throws(() => normalizeNovaPoshtaQuery("2\u202e", {
    allowEmpty: true,
    allowSingleDigit: true,
  }));
  assert.equal(normalizeNovaPoshtaRef(CITY_REF.toUpperCase()), CITY_REF);
  assert.throws(() => normalizeNovaPoshtaRef("not-a-ref"), PublicApiValidationError);
  assert.equal(normalizeNovaPoshtaWarehouseType("branch"), "branch");
  assert.throws(
    () => normalizeNovaPoshtaWarehouseType("cargo"),
    PublicApiValidationError
  );
});

test("warehouse frontend eligibility agrees with backend single-digit policy", () => {
  for (const query of ["", "2", "6", "12", "№6", "ві", "ab"]) {
    assert.equal(isNovaPoshtaWarehouseQueryEligible(query), true);
  }
  for (const query of ["в", "a", "№"]) {
    assert.equal(isNovaPoshtaWarehouseQueryEligible(query), false);
  }
});

test("warehouse handler rejects invalid input before Nova and accepts one digit", async () => {
  let calls = 0;
  const client = {
    getCities: async () => [],
    getWarehouses: async () => {
      calls += 1;
      return [{
        Ref: "warehouse-2",
        Description: "Відділення №2",
        ShortAddress: "вул. Тестова, 2",
        Number: "2",
      }];
    },
  };
  const invalid = await handleNovaPoshtaWarehousesRequest(
    { url: "http://localhost/api/nova-poshta/warehouses?cityRef=bad&type=branch&q=2" },
    { apiKey: "test-key", client }
  );
  const valid = await handleNovaPoshtaWarehousesRequest(
    { url: `http://localhost/api/nova-poshta/warehouses?cityRef=${CITY_REF}&type=branch&q=2` },
    { apiKey: "test-key", client }
  );

  assert.equal(invalid.status, 400);
  assert.equal(valid.status, 200);
  assert.equal(calls, 1);
  assert.equal((await valid.json() as unknown[]).length, 1);
});

test("Nova public mappers enforce city and warehouse result caps", () => {
  const cities = Array.from({ length: 30 }, (_, index) => ({
    Ref: String(index),
    Description: `Місто ${index}`,
  }));
  const warehouses = Array.from({ length: 70 }, (_, index) => ({
    Ref: String(index),
    Description: `Відділення №${index}`,
    ShortAddress: `Вулиця ${index}`,
  }));

  assert.equal(toPublicNovaPoshtaCities(cities).length, 20);
  assert.equal(toPublicNovaPoshtaWarehouses(warehouses, "branch", "").length, 50);
  assert.equal(
    toPublicNovaPoshtaWarehouses(warehouses, "branch", "вулиця 69").length,
    1
  );
});

test("Nova client coalesces identical city requests and serves the cache", async () => {
  let calls = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const fetcher = (async () => {
    calls += 1;
    await blocked;
    return Response.json({ success: true, data: [{ Ref: CITY_REF, Description: "Київ" }] });
  }) as typeof fetch;
  const client = createNovaPoshtaClient({ fetcher });
  const first = client.getCities("Київ", "secret");
  const second = client.getCities("Київ", "secret");

  assert.equal(calls, 0);
  release();
  assert.deepEqual(await first, await second);
  await client.getCities("Київ", "secret");
  assert.equal(calls, 1);
});

test("Nova warehouse directory requests are coalesced and cached by cityRef", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    return Response.json({ success: true, data: [{ Ref: "warehouse", Description: "Відділення" }] });
  }) as typeof fetch;
  const client = createNovaPoshtaClient({ fetcher });

  await Promise.all([
    client.getWarehouses(CITY_REF, "secret"),
    client.getWarehouses(CITY_REF, "secret"),
  ]);
  await client.getWarehouses(CITY_REF, "secret");
  assert.equal(calls, 1);
});

test("Nova timeout and unusable upstream responses expose only the stable error type", async () => {
  assert.equal(NOVA_POSHTA_TIMEOUT_MS, 4_000);
  let receivedAbortSignal = false;
  const timeoutFetcher = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      receivedAbortSignal = init?.signal instanceof AbortSignal;
      init?.signal?.addEventListener("abort", () => reject(new Error("raw upstream secret")));
    })) as typeof fetch;
  const timeoutClient = createNovaPoshtaClient({ fetcher: timeoutFetcher, timeoutMs: 5 });
  await assert.rejects(
    timeoutClient.getCities("Київ", "secret"),
    (error: unknown) =>
      error instanceof NovaPoshtaUnavailableError &&
      !error.message.includes("raw upstream secret")
  );
  assert.equal(receivedAbortSignal, true);

  const brokenClient = createNovaPoshtaClient({
    fetcher: (async () => Response.json({ success: false, errors: ["api key leaked"] })) as typeof fetch,
  });
  await assert.rejects(
    brokenClient.getWarehouses(CITY_REF, "secret"),
    NovaPoshtaUnavailableError
  );
});

test("both Nova HTTP handlers return the same safe 503 contract", async () => {
  const marker = "RAW_NOVA_SECRET_MARKER";
  const apiKey = "PRIVATE_API_KEY_MARKER";
  const failures = [
    new TypeError(`network failed: ${marker}`),
    new DOMException(marker, "AbortError"),
    new Error(`unexpected internal exception: ${marker}`),
  ];

  for (const failure of failures) {
    const client = {
      getCities: async () => { throw failure; },
      getWarehouses: async () => { throw failure; },
    };
    const responses = await Promise.all([
      handleNovaPoshtaCitiesRequest(
        { url: "http://localhost/api/nova-poshta/cities?q=Київ" },
        { apiKey, client, requestId: "cities-request-id" }
      ),
      handleNovaPoshtaWarehousesRequest(
        { url: `http://localhost/api/nova-poshta/warehouses?cityRef=${CITY_REF}&type=branch` },
        { apiKey, client, requestId: "warehouses-request-id" }
      ),
    ]);

    for (const response of responses) {
      const text = await response.text();
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("retry-after"), "5");
      assert.match(response.headers.get("x-request-id") ?? "", /request-id$/);
      assert.deepEqual(JSON.parse(text), { error: NOVA_POSHTA_UNAVAILABLE_MESSAGE });
      assert.doesNotMatch(text, new RegExp(`${marker}|${apiKey}|stack`, "i"));
    }
  }
});

test("Nova unusable and raw-error payloads stay private at the HTTP boundary", async () => {
  const marker = "RAW_UPSTREAM_PAYLOAD_MARKER";

  for (const payload of [
    { success: false, errors: [marker] },
    { success: true, data: null, internal: marker },
  ]) {
    const novaClient = createNovaPoshtaClient({
      fetcher: (async () => Response.json(payload)) as typeof fetch,
    });
    const responses = await Promise.all([
      handleNovaPoshtaCitiesRequest(
        { url: "http://localhost/api/nova-poshta/cities?q=Київ" },
        { apiKey: "test-key", client: novaClient, requestId: "request-id" }
      ),
      handleNovaPoshtaWarehousesRequest(
        { url: `http://localhost/api/nova-poshta/warehouses?cityRef=${CITY_REF}&type=branch` },
        { apiKey: "test-key", client: novaClient, requestId: "request-id" }
      ),
    ]);

    for (const response of responses) {
      const text = await response.text();
      assert.equal(response.status, 503);
      assert.equal(JSON.parse(text).error, NOVA_POSHTA_UNAVAILABLE_MESSAGE);
      assert.doesNotMatch(text, new RegExp(marker));
    }
  }
});

test("the wired Nova timeout produces safe responses for both public handlers", async () => {
  const timeoutFetcher = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("TIMEOUT_PRIVATE_MARKER", "AbortError"));
      });
    })) as typeof fetch;

  for (const endpoint of ["cities", "warehouses"] as const) {
    const client = createNovaPoshtaClient({ fetcher: timeoutFetcher, timeoutMs: 5 });
    const response = endpoint === "cities"
      ? await handleNovaPoshtaCitiesRequest(
          { url: "http://localhost/api/nova-poshta/cities?q=Київ" },
          { apiKey: "test-key", client, requestId: "timeout-id" }
        )
      : await handleNovaPoshtaWarehousesRequest(
          { url: `http://localhost/api/nova-poshta/warehouses?cityRef=${CITY_REF}&type=branch` },
          { apiKey: "test-key", client, requestId: "timeout-id" }
        );
    const text = await response.text();

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "5");
    assert.equal(response.headers.get("x-request-id"), "timeout-id");
    assert.equal(JSON.parse(text).error, NOVA_POSHTA_UNAVAILABLE_MESSAGE);
    assert.doesNotMatch(text, /TIMEOUT_PRIVATE_MARKER/);
  }
});

test("Nova backpressure rejects beyond the bounded active and queued capacity", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const fetcher = (async () => {
    await blocked;
    return Response.json({ success: true, data: [] });
  }) as typeof fetch;
  const client = createNovaPoshtaClient({
    fetcher,
    maxConcurrency: 1,
    maxQueueSize: 1,
    maxQueueWaitMs: 1_000,
  });
  const first = client.getCities("Київ", "secret");
  const second = client.getCities("Львів", "secret");
  await assert.rejects(client.getCities("Одеса", "secret"), NovaPoshtaUnavailableError);
  release();
  await Promise.all([first, second]);
});

test("Nova failures clear in-flight state and release concurrency permits", async () => {
  let calls = 0;
  const client = createNovaPoshtaClient({
    maxConcurrency: 1,
    maxQueueSize: 1,
    fetcher: (async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("first failure");
      }
      return Response.json({ success: true, data: [] });
    }) as typeof fetch,
  });

  await assert.rejects(client.getCities("Київ", "secret"));
  await client.getCities("Київ", "secret");
  await client.getCities("Львів", "secret");
  assert.equal(calls, 3);
});

test("timed-out queue entries are removed and capacity remains usable", async () => {
  let calls = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const client = createNovaPoshtaClient({
    maxConcurrency: 1,
    maxQueueSize: 1,
    maxQueueWaitMs: 5,
    fetcher: (async () => {
      calls += 1;
      if (calls === 1) {
        await blocked;
      }
      return Response.json({ success: true, data: [] });
    }) as typeof fetch,
  });
  const active = client.getCities("Київ", "secret");
  await assert.rejects(client.getCities("Львів", "secret"));
  release();
  await active;
  await client.getCities("Одеса", "secret");
  assert.equal(calls, 2);
});

test("availability handler enforces content type, bounded JSON, and malformed JSON", async () => {
  let calls = 0;
  const validate = async (items: Array<{ productId: string; variantId?: string | null }>) => {
    calls += 1;
    return items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? null,
      isAvailable: true,
      status: "ok" as const,
      message: null,
    }));
  };
  const validBody = JSON.stringify({ items: [validItem()] });
  const validBytes = new TextEncoder().encode(validBody).byteLength;
  const exactBoundaryBody = validBody + " ".repeat(
    AVAILABILITY_BODY_MAX_BYTES - validBytes
  );

  assert.equal((await handleCartAvailabilityRequest(availabilityRequest(validBody, ""), validate)).status, 415);
  assert.equal((await handleCartAvailabilityRequest(availabilityRequest(validBody, "text/plain"), validate)).status, 415);
  assert.equal((await handleCartAvailabilityRequest(availabilityRequest("{"), validate)).status, 400);
  assert.equal((await handleCartAvailabilityRequest(availabilityRequest(validBody), validate)).status, 200);
  assert.equal((await handleCartAvailabilityRequest(availabilityRequest(validBody, "Application/JSON; charset=utf-8"), validate)).status, 200);
  assert.equal((await handleCartAvailabilityRequest(availabilityRequest(exactBoundaryBody), validate)).status, 200);
  assert.equal((await handleCartAvailabilityRequest(availabilityRequest(`${exactBoundaryBody} `), validate)).status, 413);
  assert.equal(calls, 3);
});

test("availability bounded reader cancels a streamed body shortly after crossing 16 KiB", async () => {
  let pulls = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(1_024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost/api/cart/availability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const response = await handleCartAvailabilityRequest(request, async () => {
    throw new Error("validator must not run");
  });

  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
  assert.ok(pulls <= 17);
});

test("oversized declared availability bodies are rejected before reading or validation", async () => {
  let pulls = 0;
  let validationCalls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(1));
    },
  });
  const request = new Request("http://localhost/api/cart/availability", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(AVAILABILITY_BODY_MAX_BYTES + 1),
    },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  await Promise.resolve();
  const pullsBeforeHandler = pulls;
  const response = await handleCartAvailabilityRequest(request, async () => {
    validationCalls += 1;
    return [];
  });

  assert.equal(response.status, 413);
  assert.equal(pulls, pullsBeforeHandler);
  assert.equal(validationCalls, 0);
});

test("availability rejects cart limit violations before dependency access", async () => {
  let calls = 0;
  const validate = async () => { calls += 1; return []; };
  const fiftyOneUniqueLines = Array.from({ length: 51 }, (_, index) => validItem({
      productId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
  const totalFiveThousandOne = Array.from({ length: 6 }, (_, index) => validItem({
      productId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      quantity: index === 0 ? 1 : 1_000,
    }));
  const duplicateTotalBypass = [
    validItem({ quantity: 499 }),
    validItem({ quantity: 2 }),
    ...Array.from({ length: 5 }, (_, index) => validItem({
      productId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      quantity: index === 0 ? 500 : 1_000,
    })),
  ];
  const cases: Array<{ items: unknown[]; status: number }> = [
    { items: fiftyOneUniqueLines, status: 422 },
    { items: [validItem({ quantity: 1_001 })], status: 422 },
    { items: totalFiveThousandOne, status: 422 },
    { items: [validItem({ quantity: 0 })], status: 400 },
    { items: [validItem({ quantity: -1 })], status: 400 },
    { items: [validItem({ quantity: 1.5 })], status: 400 },
    { items: [validItem({ quantity: Number.MAX_SAFE_INTEGER + 1 })], status: 400 },
    { items: [validItem({ productId: "invalid" })], status: 400 },
    { items: [validItem({ variantId: "invalid" })], status: 400 },
    { items: [validItem({ quantity: 600 }), validItem({ quantity: 401 })], status: 422 },
    { items: duplicateTotalBypass, status: 422 },
  ];

  for (const { items, status } of cases) {
    const response = await handleCartAvailabilityRequest(
      availabilityRequest(JSON.stringify({ items })),
      validate
    );
    assert.equal(response.status, status);
  }
  assert.equal(calls, 0);
});

test("availability merges duplicates and never exposes exact stock or wholesale fields", async () => {
  let receivedQuantity = 0;
  const response = await handleCartAvailabilityRequest(
    availabilityRequest(JSON.stringify({ items: [validItem(), validItem({ quantity: 2 })] })),
    async (items) => {
      receivedQuantity = items[0]?.quantity ?? 0;
      return [{
        productId: PRODUCT_ID,
        variantId: null,
        isAvailable: true,
        status: "ok",
        message: null,
        stockQuantity: 999,
        wholesale_price: 1,
        internal_variant_state: "secret",
      }];
    }
  );
  const text = await response.text();

  assert.equal(receivedQuantity, 3);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(text, /stockQuantity|999|wholesale|internal_variant/);
});

test("availability unavailable DTO also omits exact stock and internal fields", async () => {
  const response = await handleCartAvailabilityRequest(
    availabilityRequest(JSON.stringify({ items: [validItem()] })),
    async () => [{
      productId: PRODUCT_ID,
      variantId: null,
      isAvailable: false,
      status: "unavailable",
      message: "Недоступно",
      stockQuantity: 0,
      wholesale_price: 100,
    }]
  );
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.match(text, /Недоступно/);
  assert.doesNotMatch(text, /stockQuantity|wholesale_price/);
});

test("availability dependency failures return a safe 503 without raw details", async () => {
  const response = await handleCartAvailabilityRequest(
    availabilityRequest(JSON.stringify({ items: [validItem()] })),
    async () => { throw new Error("Supabase password and raw database message"); },
    { requestId: "request-id" }
  );
  const text = await response.text();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "2");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(text, /Supabase|password|database/);
});

test("client coordinator deduplicates in-flight requests and briefly reuses confirmation", async () => {
  let calls = 0;
  let now = 1_000;
  const fetcher = (async () => {
    calls += 1;
    return Response.json({
      items: [{ productId: PRODUCT_ID, variantId: null, isAvailable: true, status: "ok", message: null }],
      hasUnavailableItems: false,
    });
  }) as typeof fetch;
  const coordinator = createCartAvailabilityCoordinator({ fetcher, now: () => now });
  const items = [validItem()] as Array<{ productId: string; variantId: null; quantity: number }>;

  await Promise.all([coordinator.request(items), coordinator.request(items)]);
  await coordinator.request(items);
  assert.equal(calls, 1);
  now += 1_501;
  await coordinator.request(items);
  assert.equal(calls, 2);
});

test("a confirmed multi-item cart update does not trigger an immediate equivalent bulk request", async () => {
  const productB = "33333333-3333-4333-8333-333333333333";
  const productC = "44444444-4444-4444-8444-444444444444";
  const requestBodies: Array<Array<{ productId: string; variantId: null; quantity: number }>> = [];
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      items: Array<{ productId: string; variantId: null; quantity: number }>;
    };
    requestBodies.push(body.items);
    return Response.json({
      items: body.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        isAvailable: true,
        status: "ok",
        message: null,
      })),
      hasUnavailableItems: false,
    });
  }) as typeof fetch;
  const coordinator = createCartAvailabilityCoordinator({ fetcher });
  const original = [
    { productId: PRODUCT_ID, variantId: null, quantity: 2 },
    { productId: productB, variantId: null, quantity: 1 },
    { productId: productC, variantId: null, quantity: 1 },
  ];
  const updated = original.map((item) =>
    item.productId === PRODUCT_ID ? { ...item, quantity: 3 } : item
  );

  await coordinator.request(original);
  await coordinator.request(updated);
  await coordinator.request(updated);

  assert.equal(requestBodies.length, 2);
  assert.deepEqual(requestBodies[1], [updated[0]]);
});

test("negative availability is reused briefly without changing quantity or message", async () => {
  let calls = 0;
  let now = 1_000;
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as {
      items: Array<{ productId: string; variantId: string | null; quantity: number }>;
    };
    return Response.json({
      items: body.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        isAvailable: false,
        status: "unavailable",
        message: "Товар більше недоступний у вибраній кількості",
      })),
      hasUnavailableItems: true,
    });
  }) as typeof fetch;
  const coordinator = createCartAvailabilityCoordinator({ fetcher, now: () => now });
  const unavailable = [{ productId: PRODUCT_ID, variantId: null, quantity: 4 }];
  let visibleQuantity = 3;

  const first = await coordinator.request(unavailable);
  if (first.items[0]?.isAvailable) {
    visibleQuantity = 4;
  }
  const repeated = await coordinator.request(unavailable);

  assert.equal(calls, 1);
  assert.equal(visibleQuantity, 3);
  assert.equal(
    repeated.items[0]?.message,
    "Товар більше недоступний у вибраній кількості"
  );

  now += 1_501;
  await coordinator.request(unavailable);
  assert.equal(calls, 2);

  await coordinator.request([{ ...unavailable[0], quantity: 5 }]);
  await coordinator.request([{ ...unavailable[0], variantId: CITY_REF }]);
  assert.equal(calls, 4);
});

test("client sources retain debounces, selection guards, and bounded repeat-order bulk flow", () => {
  const checkout = source("../components/Checkout/CheckoutClient.tsx");
  const hook = source("../hooks/use-cart-availability.ts");
  const account = source("../components/Account/AccountOrdersClient.tsx");
  const store = source("../stores/cart.store.ts");

  assert.match(checkout, /\}, 450\)/);
  assert.match(checkout, /\}, 400\)/);
  assert.match(checkout, /isNovaPoshtaWarehouseQueryEligible\(query\)/);
  assert.match(checkout, /if \(query\)[\s\S]*?params\.set\("q", query\)/);
  assert.match(checkout, /form\.deliveryWarehouseRef[\s\S]*?warehouseQuery\.trim\(\) === form\.deliveryWarehouse\.trim\(\)/);
  assert.match(hook, /CART_AVAILABILITY_DEBOUNCE_MS = 200/);
  assert.match(account, /await addItems\(payload\.items\)/);
  assert.doesNotMatch(account, /Promise\.all\([\s\S]*?addItem/);
  assert.match(store, /CHECKOUT_CART_MAX_RAW_LINES/);
  assert.match(store, /requestCartAvailability/);
});

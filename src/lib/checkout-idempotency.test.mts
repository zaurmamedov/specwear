import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createCheckoutRequestFingerprint,
  CheckoutIdempotencyKeyError,
  parseCheckoutIdempotencyKey,
  type AuthoritativeCheckoutResponse,
  type CheckoutFingerprintInput,
} from "./checkout-idempotency.ts";
import {
  coordinateIdempotentCheckout,
  type CheckoutIdempotencyResult,
} from "./checkout-idempotency-coordinator.ts";

const IDEMPOTENCY_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_IDEMPOTENCY_KEY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRODUCT_A_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_B_ID = "22222222-2222-4222-8222-222222222222";
const VARIANT_A_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VARIANT_B_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MIGRATION_URL = new URL(
  "../../supabase/migrations/20260730090000_add_checkout_idempotency_rpc.sql",
  import.meta.url
);
const MIGRATION_SQL = readFileSync(MIGRATION_URL, "utf8");

function assertMigrationContains(pattern: RegExp) {
  assert.match(MIGRATION_SQL, pattern);
}

function assertAppearsBefore(earlier: string, later: string) {
  const earlierIndex = MIGRATION_SQL.indexOf(earlier);
  const laterIndex = MIGRATION_SQL.indexOf(later);

  assert.notEqual(earlierIndex, -1, `Missing SQL fragment: ${earlier}`);
  assert.notEqual(laterIndex, -1, `Missing SQL fragment: ${later}`);
  assert.ok(
    earlierIndex < laterIndex,
    `Expected "${earlier}" to appear before "${later}"`
  );
}

function createFingerprintInput(
  overrides: Partial<CheckoutFingerprintInput> = {}
): CheckoutFingerprintInput {
  return {
    userId: null,
    firstName: "Іван",
    lastName: "Петренко",
    phone: "+380501234567",
    email: "ivan@example.com",
    deliveryService: "nova_poshta",
    deliveryMethod: "branch",
    deliveryCity: "Київ",
    deliveryCityRef: "city-ref",
    deliveryWarehouse: "Відділення №1",
    deliveryWarehouseRef: "warehouse-ref",
    deliveryAddress: null,
    comment: null,
    items: [
      {
        productId: PRODUCT_A_ID,
        variantId: VARIANT_A_ID,
        quantity: 2,
      },
      {
        productId: PRODUCT_B_ID,
        variantId: VARIANT_B_ID,
        quantity: 1,
      },
    ],
    ...overrides,
  };
}

function createResponse(orderId: string): AuthoritativeCheckoutResponse {
  return {
    success: true,
    orderId,
    customerType: "retail",
    subtotal: 1_500,
    deliveryPrice: 0,
    discount: 0,
    total: 1_500,
    items: [
      {
        productId: PRODUCT_A_ID,
        variantId: VARIANT_A_ID,
        quantity: 2,
        unitPrice: 500,
        lineTotal: 1_000,
      },
      {
        productId: PRODUCT_B_ID,
        variantId: VARIANT_B_ID,
        quantity: 1,
        unitPrice: 500,
        lineTotal: 500,
      },
    ],
  };
}

type PreparedAttempt = {
  key: string;
  fingerprint: string;
  response: AuthoritativeCheckoutResponse;
  failItems?: boolean;
};

function createFakeAtomicRepository() {
  const results = new Map<
    string,
    { fingerprint: string; response: AuthoritativeCheckoutResponse }
  >();
  const orders: string[] = [];
  let notifications = 0;
  let criticalSection = Promise.resolve();

  async function withLock<T>(callback: () => T | Promise<T>) {
    const previous = criticalSection;
    let release = () => {};
    criticalSection = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      return await callback();
    } finally {
      release();
    }
  }

  return {
    orders,
    get notifications() {
      return notifications;
    },
    lookup(
      key: string,
      fingerprint: string
    ): CheckoutIdempotencyResult<AuthoritativeCheckoutResponse> {
      const existing = results.get(key);

      if (!existing) {
        return { outcome: "missing" };
      }

      if (existing.fingerprint !== fingerprint) {
        return { outcome: "conflict" };
      }

      return { outcome: "reused", response: existing.response };
    },
    commit(prepared: PreparedAttempt) {
      return withLock<
        CheckoutIdempotencyResult<AuthoritativeCheckoutResponse>
      >(() => {
        const existing = results.get(prepared.key);

        if (existing) {
          return existing.fingerprint === prepared.fingerprint
            ? { outcome: "reused", response: existing.response }
            : { outcome: "conflict" };
        }

        if (prepared.failItems) {
          throw new Error("Simulated order_items failure.");
        }

        orders.push(prepared.response.orderId);
        results.set(prepared.key, {
          fingerprint: prepared.fingerprint,
          response: prepared.response,
        });
        return { outcome: "created", response: prepared.response };
      });
    },
    notify() {
      notifications += 1;
    },
  };
}

async function runAttempt(input: {
  repository: ReturnType<typeof createFakeAtomicRepository>;
  key: string;
  fingerprint: string;
  orderId: string;
  failItems?: boolean;
}) {
  return coordinateIdempotentCheckout({
    lookup: async () =>
      input.repository.lookup(input.key, input.fingerprint),
    prepare: async () => ({
      key: input.key,
      fingerprint: input.fingerprint,
      response: createResponse(input.orderId),
      failItems: input.failItems,
    }),
    commit: (prepared) => input.repository.commit(prepared),
    afterCreated: async () => {
      input.repository.notify();
    },
  });
}

test("відхиляє відсутній або некоректний Idempotency-Key", () => {
  assert.throws(
    () => parseCheckoutIdempotencyKey(null),
    CheckoutIdempotencyKeyError
  );
  assert.throws(
    () => parseCheckoutIdempotencyKey("not-a-uuid"),
    CheckoutIdempotencyKeyError
  );
  assert.equal(parseCheckoutIdempotencyKey(IDEMPOTENCY_KEY), IDEMPOTENCY_KEY);
});

test("міграція закріплює UNIQUE, advisory lock, atomic inserts і service-role-only RPC", () => {
  assertMigrationContains(/idempotency_key uuid primary key/);
  assertMigrationContains(/order_id uuid not null unique/);
  assertMigrationContains(/pg_catalog\.pg_advisory_xact_lock/);
  assertMigrationContains(/insert into public\.orders/);
  assertMigrationContains(/insert into public\.order_items/);
  assertMigrationContains(/insert into public\.checkout_idempotency/);
  assertMigrationContains(
    /revoke all on function public\.create_checkout_order_idempotent[\s\S]*from public, anon, authenticated/
  );
  assertMigrationContains(
    /grant execute on function public\.create_checkout_order_idempotent[\s\S]*to service_role/
  );
  assertMigrationContains(
    /revoke insert on table public\.orders from anon, authenticated/
  );
});

test("RPC відхиляє NULL у всіх критичних параметрах до lock та insert", () => {
  for (const parameter of [
    "p_idempotency_key",
    "p_request_fingerprint",
    "p_order_id",
    "p_customer_type",
    "p_first_name",
    "p_last_name",
    "p_phone",
    "p_delivery_service",
    "p_delivery_method",
    "p_delivery_city",
    "p_subtotal",
    "p_delivery_price",
    "p_discount",
    "p_total",
    "p_items",
  ]) {
    assertMigrationContains(new RegExp(`${parameter} is null`, "i"));
  }

  assertAppearsBefore(
    "if p_idempotency_key is null then",
    "perform pg_catalog.pg_advisory_xact_lock"
  );
  assertAppearsBefore(
    "if p_items is null then",
    "insert into public.orders"
  );
});

test("RPC окремо відхиляє SQL NULL, JSON null, non-array та порожній p_items", () => {
  assertMigrationContains(/if p_items is null then/);
  assertMigrationContains(
    /pg_catalog\.jsonb_typeof\(p_items\) is distinct from 'array'/
  );
  assertMigrationContains(
    /v_item_count := pg_catalog\.jsonb_array_length\(p_items\)/
  );
  assertMigrationContains(/if v_item_count = 0 then/);
  assertAppearsBefore(
    "pg_catalog.jsonb_typeof(p_items) is distinct from 'array'",
    "pg_catalog.jsonb_array_length(p_items)"
  );
});

test("RPC перевіряє required item fields, UUID та nullable snapshot fields", () => {
  assertMigrationContains(
    /pg_catalog\.jsonb_typeof\(v_item\) is distinct from 'object'/
  );

  for (const field of ["product_id", "variant_id"]) {
    assertMigrationContains(
      new RegExp(
        `jsonb_typeof\\(v_item->'${field}'\\) is distinct from 'string'[\\s\\S]*v_item->>'${field}'[\\s\\S]*\\^\\[0-9a-fA-F\\]`
      )
    );
  }

  assertMigrationContains(
    /jsonb_typeof\(v_item->'product_name'\) is distinct from 'string'/
  );
  assertMigrationContains(/pg_catalog\.btrim\(v_item->>'product_name'\) = ''/);

  for (const field of [
    "product_slug",
    "image_url",
    "sku",
    "size",
    "color",
    "brand_name",
    "category_name",
  ]) {
    assertMigrationContains(new RegExp(`'${field}'`));
  }

  assertMigrationContains(/not in \('string', 'null'\)/);
});

test("RPC перевіряє quantity, price, line total і subtotal без integer overflow", () => {
  for (const field of ["quantity", "price", "total"]) {
    assertMigrationContains(
      new RegExp(
        `jsonb_typeof\\(v_item->'${field}'\\) is distinct from 'number'`
      )
    );
    assertMigrationContains(
      new RegExp(`\\(v_item->>'${field}'\\) !~ '\\^\\[0-9\\]\\+\\$'`)
    );
  }

  assertMigrationContains(/v_item_quantity <= 0/);
  assertMigrationContains(/v_item_quantity > 2147483647/);
  assertMigrationContains(/v_item_price > 2147483647/);
  assertMigrationContains(/v_item_total > 2147483647/);
  assertMigrationContains(
    /v_item_total <> v_item_price \* v_item_quantity/
  );
  assertMigrationContains(
    /v_items_subtotal > 2147483647 - v_item_total/
  );
  assertMigrationContains(/v_items_subtotal <> p_subtotal::bigint/);
});

test("RPC перевіряє NULL, діапазон і рівняння фінальних totals", () => {
  assertMigrationContains(
    /p_subtotal is null[\s\S]*p_delivery_price is null[\s\S]*p_discount is null[\s\S]*p_total is null/
  );
  assertMigrationContains(/p_subtotal < 0/);
  assertMigrationContains(/p_delivery_price < 0/);
  assertMigrationContains(/p_discount < 0/);
  assertMigrationContains(/p_total < 0/);
  assertMigrationContains(
    /p_discount::bigint > p_subtotal::bigint \+ p_delivery_price::bigint/
  );
  assertMigrationContains(
    /p_total::bigint <>[\s\S]*p_subtotal::bigint \+ p_delivery_price::bigint - p_discount::bigint/
  );
});

test("RPC не може зафіксувати order без повного набору валідованих order_items", () => {
  assertMigrationContains(/get diagnostics v_inserted_items = row_count/);
  assertMigrationContains(/if v_inserted_items <> v_item_count then/);
  assertAppearsBefore(
    "if v_inserted_items <> v_item_count then",
    "insert into public.checkout_idempotency"
  );
  assert.doesNotMatch(MIGRATION_SQL, /exception\s+when/i);
});

test("SECURITY DEFINER має порожній search_path і schema-qualified application objects", () => {
  assertMigrationContains(/security definer\s+set search_path = ''/);
  assert.doesNotMatch(MIGRATION_SQL, /set search_path\s*=\s*public/i);

  for (const relation of [
    "public.checkout_idempotency",
    "public.orders",
    "public.order_items",
  ]) {
    assertMigrationContains(new RegExp(relation.replace(".", "\\.")));
  }
});

test("міграція зберігає закриту RPC/table permission model без legacy policies", () => {
  assertMigrationContains(
    /revoke all on table public\.checkout_idempotency from public, anon, authenticated/
  );
  assertMigrationContains(
    /grant select, insert on table public\.checkout_idempotency to service_role/
  );
  assertMigrationContains(
    /revoke insert on table public\.orders from anon, authenticated/
  );
  assertMigrationContains(
    /revoke insert on table public\.order_items from anon, authenticated/
  );
  assertMigrationContains(
    /drop policy if exists "Anyone can create orders" on public\.orders/
  );
  assertMigrationContains(
    /drop policy if exists "Anyone can create order items" on public\.order_items/
  );
  assertMigrationContains(
    /revoke all on function public\.create_checkout_order_idempotent[\s\S]*from public, anon, authenticated/
  );
  assertMigrationContains(
    /grant execute on function public\.create_checkout_order_idempotent[\s\S]*to service_role/
  );
  assert.doesNotMatch(
    MIGRATION_SQL,
    /grant execute on function public\.create_checkout_order_idempotent[\s\S]*to (?:public|anon|authenticated)/
  );
});

test("валідований item shape передається в set-based insert без зміни money representation", () => {
  assertMigrationContains(
    /from pg_catalog\.jsonb_to_recordset\(p_items\) as item\([\s\S]*product_id uuid,[\s\S]*variant_id uuid,[\s\S]*product_name text,[\s\S]*price integer,[\s\S]*quantity integer,[\s\S]*total integer[\s\S]*\)/
  );
  assertAppearsBefore(
    "v_items_subtotal <> p_subtotal::bigint",
    "insert into public.orders"
  );
  assertAppearsBefore(
    "insert into public.order_items",
    "insert into public.checkout_idempotency"
  );
});

test("fingerprint стабільний для іншого порядку items і ігнорує грошові поля", () => {
  const canonical = createFingerprintInput();
  const reorderedWithTamperedMoney = createFingerprintInput({
    items: [
      {
        productId: PRODUCT_B_ID,
        variantId: VARIANT_B_ID,
        quantity: 1,
        price: 1,
        total: 0,
      },
      {
        productId: PRODUCT_A_ID,
        variantId: VARIANT_A_ID,
        quantity: 2,
        unitPrice: 1,
        lineTotal: 0,
      },
    ] as unknown as CheckoutFingerprintInput["items"],
  });

  assert.equal(
    createCheckoutRequestFingerprint(canonical),
    createCheckoutRequestFingerprint(reorderedWithTamperedMoney)
  );
});

test("fingerprint прив'язаний до користувача та семантичних даних", () => {
  const guestFingerprint = createCheckoutRequestFingerprint(
    createFingerprintInput()
  );
  const authenticatedFingerprint = createCheckoutRequestFingerprint(
    createFingerprintInput({ userId: USER_ID })
  );
  const changedDeliveryFingerprint = createCheckoutRequestFingerprint(
    createFingerprintInput({ deliveryWarehouseRef: "another-warehouse" })
  );

  assert.notEqual(guestFingerprint, authenticatedFingerprint);
  assert.notEqual(guestFingerprint, changedDeliveryFingerprint);
});

test("guest та authenticated checkout підтримують незалежні idempotent attempts", async () => {
  const repository = createFakeAtomicRepository();
  const guestFingerprint = createCheckoutRequestFingerprint(
    createFingerprintInput()
  );
  const authenticatedFingerprint = createCheckoutRequestFingerprint(
    createFingerprintInput({ userId: USER_ID })
  );

  const guest = await runAttempt({
    repository,
    key: IDEMPOTENCY_KEY,
    fingerprint: guestFingerprint,
    orderId: "guest-order",
  });
  const authenticated = await runAttempt({
    repository,
    key: SECOND_IDEMPOTENCY_KEY,
    fingerprint: authenticatedFingerprint,
    orderId: "authenticated-order",
  });

  assert.equal(guest.outcome, "created");
  assert.equal(authenticated.outcome, "created");
  assert.deepEqual(repository.orders, ["guest-order", "authenticated-order"]);
});

test("перший запит створює order, а replay повертає його без дубля і Telegram", async () => {
  const repository = createFakeAtomicRepository();
  const fingerprint = createCheckoutRequestFingerprint(createFingerprintInput());
  const first = await runAttempt({
    repository,
    key: IDEMPOTENCY_KEY,
    fingerprint,
    orderId: "order-1",
  });
  const replay = await runAttempt({
    repository,
    key: IDEMPOTENCY_KEY,
    fingerprint,
    orderId: "order-2",
  });

  assert.equal(first.outcome, "created");
  assert.equal(replay.outcome, "reused");
  assert.equal(
    replay.outcome === "reused" ? replay.response.orderId : null,
    "order-1"
  );
  assert.deepEqual(repository.orders, ["order-1"]);
  assert.equal(repository.notifications, 1);
});

test("той самий ключ з іншим fingerprint повертає conflict", async () => {
  const repository = createFakeAtomicRepository();
  const fingerprint = createCheckoutRequestFingerprint(createFingerprintInput());
  await runAttempt({
    repository,
    key: IDEMPOTENCY_KEY,
    fingerprint,
    orderId: "order-1",
  });
  const conflict = await runAttempt({
    repository,
    key: IDEMPOTENCY_KEY,
    fingerprint: createCheckoutRequestFingerprint(
      createFingerprintInput({ phone: "+380501111111" })
    ),
    orderId: "order-2",
  });

  assert.equal(conflict.outcome, "conflict");
  assert.deepEqual(repository.orders, ["order-1"]);
  assert.equal(repository.notifications, 1);
});

test("два конкурентні запити з одним ключем створюють один order", async () => {
  const repository = createFakeAtomicRepository();
  const fingerprint = createCheckoutRequestFingerprint(createFingerprintInput());
  const [first, second] = await Promise.all([
    runAttempt({
      repository,
      key: IDEMPOTENCY_KEY,
      fingerprint,
      orderId: "order-1",
    }),
    runAttempt({
      repository,
      key: IDEMPOTENCY_KEY,
      fingerprint,
      orderId: "order-2",
    }),
  ]);

  assert.deepEqual(
    [first.outcome, second.outcome].sort(),
    ["created", "reused"]
  );
  assert.equal(repository.orders.length, 1);
  assert.equal(repository.notifications, 1);
});

test("помилка order_items не залишає order і той самий ключ можна повторити", async () => {
  const repository = createFakeAtomicRepository();
  const fingerprint = createCheckoutRequestFingerprint(createFingerprintInput());

  await assert.rejects(
    runAttempt({
      repository,
      key: IDEMPOTENCY_KEY,
      fingerprint,
      orderId: "failed-order",
      failItems: true,
    }),
    /order_items/
  );
  assert.deepEqual(repository.orders, []);

  const retry = await runAttempt({
    repository,
    key: IDEMPOTENCY_KEY,
    fingerprint,
    orderId: "order-1",
  });

  assert.equal(retry.outcome, "created");
  assert.deepEqual(repository.orders, ["order-1"]);
});

test("новий ключ дозволяє свідомо створити ще одне ідентичне замовлення", async () => {
  const repository = createFakeAtomicRepository();
  const fingerprint = createCheckoutRequestFingerprint(createFingerprintInput());

  await runAttempt({
    repository,
    key: IDEMPOTENCY_KEY,
    fingerprint,
    orderId: "order-1",
  });
  await runAttempt({
    repository,
    key: SECOND_IDEMPOTENCY_KEY,
    fingerprint,
    orderId: "order-2",
  });

  assert.deepEqual(repository.orders, ["order-1", "order-2"]);
  assert.equal(repository.notifications, 2);
});

test("недостатній stock не запускає afterCreated і дозволяє повторити той самий ключ", async () => {
  let stockAvailable = false;
  let notifications = 0;
  const response = createResponse("order-after-restock");

  async function attempt() {
    return coordinateIdempotentCheckout({
      lookup: async () => ({ outcome: "missing" as const }),
      prepare: async () => response,
      commit: async () =>
        stockAvailable
          ? ({ outcome: "created", response } as const)
          : ({ outcome: "insufficient_stock" } as const),
      afterCreated: async () => {
        notifications += 1;
      },
    });
  }

  const insufficient = await attempt();
  assert.equal(insufficient.outcome, "insufficient_stock");
  assert.equal(notifications, 0);

  stockAvailable = true;
  const retry = await attempt();
  assert.equal(retry.outcome, "created");
  assert.equal(notifications, 1);
});

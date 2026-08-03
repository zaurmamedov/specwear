import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const MIGRATION_SQL = readFileSync(
  new URL(
    "../../supabase/migrations/20260802090000_add_atomic_inventory.sql",
    import.meta.url
  ),
  "utf8"
);
const CHECKOUT_SERVICE = readFileSync(
  new URL("../services/checkout-order.service.ts", import.meta.url),
  "utf8"
);
const CHECKOUT_ROUTE = readFileSync(
  new URL("../app/api/checkout/orders/route.ts", import.meta.url),
  "utf8"
);
const ORDER_SERVICE = readFileSync(
  new URL("../services/orders.service.ts", import.meta.url),
  "utf8"
);
const ADMIN_VARIANT_SERVICE = readFileSync(
  new URL("../services/admin-products.service.ts", import.meta.url),
  "utf8"
);
const AVAILABILITY_ROUTE = readFileSync(
  new URL("../app/api/cart/availability/route.ts", import.meta.url),
  "utf8"
);

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

test("migration refuses negative legacy stock and installs a non-negative constraint", () => {
  assert.match(MIGRATION_SQL, /where stock_quantity < 0/);
  assert.match(
    MIGRATION_SQL,
    /constraint product_variants_stock_quantity_nonnegative[\s\S]*check \(stock_quantity >= 0\)/
  );
  assertAppearsBefore(
    "where stock_quantity < 0",
    "add constraint product_variants_stock_quantity_nonnegative"
  );
});

test("checkout resolves idempotency before taking deterministic variant locks", () => {
  assertAppearsBefore(
    "perform pg_catalog.pg_advisory_xact_lock",
    "from public.checkout_idempotency"
  );
  assertAppearsBefore(
    "from public.checkout_idempotency",
    "for update of variant"
  );
  assert.match(
    MIGRATION_SQL,
    /order by variant\.id\s+for update of variant/
  );
  assertAppearsBefore("for update of variant", "set stock_quantity =");
});

test("checkout revalidates catalog state and aggregate stock inside PostgreSQL", () => {
  assert.match(MIGRATION_SQL, /variant\.product_id <> \(item\.value->>'product_id'\)::uuid/);
  assert.match(MIGRATION_SQL, /variant\.is_active is distinct from true/);
  assert.match(MIGRATION_SQL, /product\.is_active is distinct from true/);
  assert.match(MIGRATION_SQL, /product\.status is distinct from 'active'/);
  assert.match(
    MIGRATION_SQL,
    /sum\(\(item\.value->>'quantity'\)::bigint\)[\s\S]*group by \(item\.value->>'variant_id'\)::uuid/
  );
  assert.match(
    MIGRATION_SQL,
    /variant\.stock_quantity::bigint < requested\.quantity/
  );
});

test("checkout conditionally decrements every variant and records one movement", () => {
  assert.match(
    MIGRATION_SQL,
    /set stock_quantity = variant\.stock_quantity - requested\.quantity/
  );
  assert.match(MIGRATION_SQL, /variant\.stock_quantity >= requested\.quantity/);
  assert.match(MIGRATION_SQL, /v_affected_variants <> v_requested_variant_count/);
  assert.match(MIGRATION_SQL, /'order_decrement'/);
  assert.match(MIGRATION_SQL, /v_inserted_movements <> v_requested_variant_count/);
  assertAppearsBefore("set stock_quantity =", "insert into public.orders");
  assertAppearsBefore("insert into public.order_items", "insert into public.inventory_movements (");
  assertAppearsBefore("insert into public.inventory_movements (", "insert into public.checkout_idempotency");
});

test("inventory movements enforce positive quantities and once-per-order movement types", () => {
  assert.match(MIGRATION_SQL, /movement_type in \('order_decrement', 'order_cancel_restore'\)/);
  assert.match(MIGRATION_SQL, /check \(quantity > 0\)/);
  assert.match(MIGRATION_SQL, /unique \(order_id, variant_id, movement_type\)/);
  assert.match(
    MIGRATION_SQL,
    /variant_id uuid not null[\s\S]*references public\.product_variants\(id\)[\s\S]*on delete restrict/
  );
  assert.match(MIGRATION_SQL, /alter table public\.inventory_movements enable row level security/);
  assert.match(
    MIGRATION_SQL,
    /revoke all on table public\.inventory_movements from public, anon, authenticated/
  );
});

test("cancellation locks the order and variants, restores once, and forbids reopening", () => {
  assert.match(MIGRATION_SQL, /create function public\.update_order_status_with_inventory/);
  assert.match(MIGRATION_SQL, /from public\.orders[\s\S]*for update/);
  assert.match(MIGRATION_SQL, /v_current_status = 'cancelled'[\s\S]*reopening_forbidden/);
  assert.match(MIGRATION_SQL, /movement_type = 'order_cancel_restore'/);
  assert.match(
    MIGRATION_SQL,
    /set stock_quantity = variant\.stock_quantity \+ movement\.quantity/
  );
  assert.match(
    MIGRATION_SQL,
    /on conflict \(order_id, variant_id, movement_type\) do nothing/
  );
});

test("all inventory RPCs remain hardened and service-role-only", () => {
  for (const functionName of [
    "create_checkout_order_idempotent",
    "update_order_status_with_inventory",
    "update_product_variant_admin",
  ]) {
    assert.match(
      MIGRATION_SQL,
      new RegExp(`(?:create|create or replace) function public\\.${functionName}[\\s\\S]*security definer[\\s\\S]*set search_path = ''`)
    );
    assert.match(
      MIGRATION_SQL,
      new RegExp(`revoke all on function public\\.${functionName}[\\s\\S]*from public, anon, authenticated`)
    );
    assert.match(
      MIGRATION_SQL,
      new RegExp(`grant execute on function public\\.${functionName}[\\s\\S]*to service_role`)
    );
  }
});

test("application maps insufficient stock safely and never reintroduces direct status updates", () => {
  assert.match(CHECKOUT_SERVICE, /data\.outcome === "insufficient_stock"/);
  assert.match(CHECKOUT_ROUTE, /CHECKOUT_INSUFFICIENT_STOCK/);
  assert.match(
    CHECKOUT_ROUTE,
    /Недостатньо товару в наявності\. Оновіть кошик і спробуйте ще раз\./
  );
  assert.match(ORDER_SERVICE, /rpc\("update_order_status_with_inventory"/);
  assert.doesNotMatch(ORDER_SERVICE, /from\("orders"\)\.update/);
});

test("admin variant update uses expected stock and availability normalizes duplicate lines", () => {
  assert.match(ADMIN_VARIANT_SERVICE, /rpc\("update_product_variant_admin"/);
  assert.match(ADMIN_VARIANT_SERVICE, /p_expected_stock_quantity/);
  assert.match(ADMIN_VARIANT_SERVICE, /p_expected_updated_at/);
  assert.match(ADMIN_VARIANT_SERVICE, /data\.outcome === "stock_conflict"/);
  assert.match(AVAILABILITY_ROUTE, /parseCheckoutCartItems\(body\.items\)/);
});

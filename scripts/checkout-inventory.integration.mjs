import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for local Supabase.");
}

const hostname = new URL(supabaseUrl).hostname;

if (hostname !== "127.0.0.1" && hostname !== "localhost") {
  throw new Error("Inventory integration tests are restricted to local Supabase.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const runId = crypto.randomUUID();
const productId = crypto.randomUUID();
const variantAId = crypto.randomUUID();
const variantBId = crypto.randomUUID();

function checkoutArgs({
  key = crypto.randomUUID(),
  orderId = crypto.randomUUID(),
  items,
}) {
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);

  return {
    p_idempotency_key: key,
    p_request_fingerprint: "a".repeat(64),
    p_order_id: orderId,
    p_user_id: null,
    p_first_name: "Локальний",
    p_last_name: "Тест",
    p_phone: "+380000000000",
    p_email: null,
    p_customer_type: "retail",
    p_delivery_service: "test",
    p_delivery_method: "test",
    p_delivery_city: "Київ",
    p_delivery_city_ref: null,
    p_delivery_warehouse: null,
    p_delivery_warehouse_ref: null,
    p_delivery_address: null,
    p_comment: `local-inventory-test:${runId}`,
    p_subtotal: subtotal,
    p_delivery_price: 0,
    p_discount: 0,
    p_total: subtotal,
    p_items: items,
  };
}

function item(variantId, quantity = 1) {
  return {
    product_id: productId,
    variant_id: variantId,
    product_name: "Локальний inventory fixture",
    product_slug: `local-inventory-${runId}`,
    image_url: null,
    sku: `LOCAL-${variantId.slice(0, 8)}`,
    size: null,
    color: null,
    brand_name: null,
    category_name: null,
    price: 100,
    quantity,
    total: 100 * quantity,
  };
}

async function stock(variantId) {
  const { data, error } = await supabase
    .from("product_variants")
    .select("stock_quantity, updated_at")
    .eq("id", variantId)
    .single();

  assert.ifError(error);
  return data;
}

const { error: productError } = await supabase.from("products").insert({
  id: productId,
  name: "Local inventory fixture",
  slug: `local-inventory-${runId}`,
  status: "active",
  is_active: true,
});
assert.ifError(productError);

const { error: variantsError } = await supabase.from("product_variants").insert([
  {
    id: variantAId,
    product_id: productId,
    sku: `LOCAL-A-${runId}`,
    retail_price: 100,
    stock_quantity: 1,
    is_active: true,
  },
  {
    id: variantBId,
    product_id: productId,
    sku: `LOCAL-B-${runId}`,
    retail_price: 100,
    stock_quantity: 0,
    is_active: true,
  },
]);
assert.ifError(variantsError);

const firstKey = crypto.randomUUID();
const firstOrderId = crypto.randomUUID();
const firstArgs = checkoutArgs({
  key: firstKey,
  orderId: firstOrderId,
  items: [item(variantAId)],
});
const competingArgs = checkoutArgs({ items: [item(variantAId)] });
const [firstAttempt, competingAttempt] = await Promise.all([
  supabase.rpc("create_checkout_order_idempotent", firstArgs),
  supabase.rpc("create_checkout_order_idempotent", competingArgs),
]);

assert.ifError(firstAttempt.error);
assert.ifError(competingAttempt.error);
assert.deepEqual(
  [firstAttempt.data.outcome, competingAttempt.data.outcome].sort(),
  ["created", "insufficient_stock"]
);
assert.equal((await stock(variantAId)).stock_quantity, 0);

const { count: createdOrderCount, error: orderCountError } = await supabase
  .from("orders")
  .select("id", { count: "exact", head: true })
  .in("id", [firstArgs.p_order_id, competingArgs.p_order_id]);
assert.ifError(orderCountError);
assert.equal(createdOrderCount, 1);

const createdArgs =
  firstAttempt.data.outcome === "created" ? firstArgs : competingArgs;
const replay = await supabase.rpc("create_checkout_order_idempotent", createdArgs);
assert.ifError(replay.error);
assert.equal(replay.data.outcome, "reused");
assert.equal((await stock(variantAId)).stock_quantity, 0);

const multiItemFailure = await supabase.rpc(
  "create_checkout_order_idempotent",
  checkoutArgs({ items: [item(variantAId), item(variantBId)] })
);
assert.ifError(multiItemFailure.error);
assert.equal(multiItemFailure.data.outcome, "insufficient_stock");
assert.equal((await stock(variantAId)).stock_quantity, 0);

const cancellation = await supabase.rpc("update_order_status_with_inventory", {
  p_order_id: createdArgs.p_order_id,
  p_status: "cancelled",
});
assert.ifError(cancellation.error);
assert.equal(cancellation.data.outcome, "updated");
assert.equal(cancellation.data.stockRestored, true);
assert.equal((await stock(variantAId)).stock_quantity, 1);

const repeatedCancellation = await supabase.rpc(
  "update_order_status_with_inventory",
  { p_order_id: createdArgs.p_order_id, p_status: "cancelled" }
);
assert.ifError(repeatedCancellation.error);
assert.equal(repeatedCancellation.data.outcome, "unchanged");
assert.equal((await stock(variantAId)).stock_quantity, 1);

const reopening = await supabase.rpc("update_order_status_with_inventory", {
  p_order_id: createdArgs.p_order_id,
  p_status: "processing",
});
assert.ifError(reopening.error);
assert.equal(reopening.data.outcome, "reopening_forbidden");

const failedKey = crypto.randomUUID();
const forcedFailure = await supabase.rpc(
  "create_checkout_order_idempotent",
  checkoutArgs({
    key: failedKey,
    orderId: createdArgs.p_order_id,
    items: [item(variantAId)],
  })
);
assert.ok(forcedFailure.error, "Expected duplicate order ID to force rollback.");
assert.equal((await stock(variantAId)).stock_quantity, 1);

const { data: failedIdempotency, error: failedIdempotencyError } = await supabase
  .from("checkout_idempotency")
  .select("idempotency_key")
  .eq("idempotency_key", failedKey)
  .maybeSingle();
assert.ifError(failedIdempotencyError);
assert.equal(failedIdempotency, null);

const negativeUpdate = await supabase
  .from("product_variants")
  .update({ stock_quantity: -1 })
  .eq("id", variantBId);
assert.ok(negativeUpdate.error, "Expected the non-negative constraint to reject -1.");
assert.equal((await stock(variantBId)).stock_quantity, 0);

const adminVersion = await stock(variantAId);
const adminUpdate = await supabase.rpc("update_product_variant_admin", {
  p_variant_id: variantAId,
  p_product_id: productId,
  p_expected_stock_quantity: adminVersion.stock_quantity,
  p_expected_updated_at: adminVersion.updated_at,
  p_stock_quantity: 5,
  p_sku: `LOCAL-A-${runId}`,
  p_size: null,
  p_color: null,
  p_retail_price: 100,
  p_old_price: null,
  p_wholesale_price: null,
  p_is_active: true,
});
assert.ifError(adminUpdate.error);
assert.equal(adminUpdate.data.outcome, "updated");

const staleAdminUpdate = await supabase.rpc("update_product_variant_admin", {
  p_variant_id: variantAId,
  p_product_id: productId,
  p_expected_stock_quantity: adminVersion.stock_quantity,
  p_expected_updated_at: adminVersion.updated_at,
  p_stock_quantity: 9,
  p_sku: `LOCAL-A-${runId}`,
  p_size: null,
  p_color: null,
  p_retail_price: 100,
  p_old_price: null,
  p_wholesale_price: null,
  p_is_active: true,
});
assert.ifError(staleAdminUpdate.error);
assert.equal(staleAdminUpdate.data.outcome, "stock_conflict");
assert.equal((await stock(variantAId)).stock_quantity, 5);

const resetVersion = await stock(variantAId);
const resetForConcurrency = await supabase.rpc("update_product_variant_admin", {
  p_variant_id: variantAId,
  p_product_id: productId,
  p_expected_stock_quantity: resetVersion.stock_quantity,
  p_expected_updated_at: resetVersion.updated_at,
  p_stock_quantity: 1,
  p_sku: `LOCAL-A-${runId}`,
  p_size: null,
  p_color: null,
  p_retail_price: 100,
  p_old_price: null,
  p_wholesale_price: null,
  p_is_active: true,
});
assert.ifError(resetForConcurrency.error);
assert.equal(resetForConcurrency.data.outcome, "updated");

const concurrentVersion = await stock(variantAId);
const concurrentCheckoutArgs = checkoutArgs({ items: [item(variantAId)] });
const [concurrentCheckout, concurrentAdmin] = await Promise.all([
  supabase.rpc("create_checkout_order_idempotent", concurrentCheckoutArgs),
  supabase.rpc("update_product_variant_admin", {
    p_variant_id: variantAId,
    p_product_id: productId,
    p_expected_stock_quantity: concurrentVersion.stock_quantity,
    p_expected_updated_at: concurrentVersion.updated_at,
    p_stock_quantity: 5,
    p_sku: `LOCAL-A-${runId}`,
    p_size: null,
    p_color: null,
    p_retail_price: 100,
    p_old_price: null,
    p_wholesale_price: null,
    p_is_active: true,
  }),
]);
assert.ifError(concurrentCheckout.error);
assert.ifError(concurrentAdmin.error);
assert.equal(concurrentCheckout.data.outcome, "created");
assert.ok(
  concurrentAdmin.data.outcome === "updated" ||
    concurrentAdmin.data.outcome === "stock_conflict"
);
assert.equal(
  (await stock(variantAId)).stock_quantity,
  concurrentAdmin.data.outcome === "updated" ? 4 : 0
);

console.log(`Local inventory integration checks passed for fixture ${runId}.`);

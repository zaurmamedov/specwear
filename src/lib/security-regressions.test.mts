import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { toPublicProductVariants } from "./public-product.ts";
import { validateCheckoutInput } from "./checkout-validation.ts";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const migration = source(
  "../../supabase/migrations/20260830120000_disable_public_wholesale_self_service.sql"
);

test("registration ignores browser-supplied wholesale authorization", () => {
  const registerRoute = source("../app/api/auth/register/route.ts");
  const registerForm = source("../components/Auth/CustomerRegisterForm.tsx");
  const accountService = source("../services/account.service.ts");

  assert.doesNotMatch(registerForm, /customer_?type|wholesale|is_wholesale_approved/i);
  assert.doesNotMatch(registerRoute, /body\.(?:customer_?type|is_wholesale_approved)/i);
  assert.doesNotMatch(registerRoute, /customer_type\s*:/);
  assert.doesNotMatch(registerRoute, /is_wholesale_approved\s*:/);
  assert.match(accountService, /customerEditablePayload/);
  assert.doesNotMatch(
    accountService.match(/const customerEditablePayload = \{[\s\S]*?\n  \};/)?.[0] ?? "",
    /customer_type|is_wholesale_approved/
  );
  assert.match(migration, /customer_type set default 'retail'/);
  assert.match(migration, /is_wholesale_approved set default false/);
});

test("guest checkout ignores legacy wholesale request fields", () => {
  const checkoutClient = source("../components/Checkout/CheckoutClient.tsx");
  const normalized = validateCheckoutInput({
    firstName: "Іван",
    lastName: "Петренко",
    phone: "+380671234567",
    email: "ivan@example.com",
    deliveryService: "nova_poshta",
    deliveryMethod: "branch",
    deliveryCity: "Київ",
    deliveryCityRef: "22222222-2222-4222-8222-222222222222",
    deliveryWarehouse: "Відділення №1",
    deliveryWarehouseRef: "33333333-3333-4333-8333-333333333333",
    deliveryAddress: null,
    comment: null,
    items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
    turnstileToken: "test-turnstile-token",
    customerType: "wholesale",
    customer_type: "wholesale",
    is_wholesale_approved: true,
  });

  assert.equal("customerType" in normalized, false);
  assert.equal("customer_type" in normalized, false);
  assert.equal("is_wholesale_approved" in normalized, false);
  assert.doesNotMatch(checkoutClient, /name=["']customerType["']/);
  assert.doesNotMatch(checkoutClient, /value=["']wholesale["']/);
});

test("profile grants protect wholesale authorization and preserve editable fields", () => {
  assert.match(migration, /revoke insert, update on table public\.profiles from authenticated/);

  const updateGrant = migration.match(
    /grant update \(([\s\S]*?)\) on table public\.profiles to authenticated/
  )?.[1];
  const insertGrant = migration.match(
    /grant insert \(([\s\S]*?)\) on table public\.profiles to authenticated/
  )?.[1];

  assert.ok(updateGrant);
  assert.ok(insertGrant);
  for (const protectedColumn of [
    "id",
    "customer_type",
    "is_wholesale_approved",
    "created_at",
    "updated_at",
  ]) {
    assert.doesNotMatch(updateGrant, new RegExp(`\\b${protectedColumn}\\b`));
  }
  for (const protectedColumn of [
    "customer_type",
    "is_wholesale_approved",
    "created_at",
    "updated_at",
  ]) {
    assert.doesNotMatch(insertGrant, new RegExp(`\\b${protectedColumn}\\b`));
  }
  for (const editableColumn of [
    "email",
    "first_name",
    "last_name",
    "phone",
    "delivery_service",
    "delivery_method",
    "delivery_city",
    "delivery_city_ref",
    "delivery_warehouse",
    "delivery_warehouse_ref",
    "delivery_address",
  ]) {
    assert.match(updateGrant, new RegExp(`\\b${editableColumn}\\b`));
  }
});

test("public product variants exclude inactive and sensitive inventory fields", () => {
  const internalVariants = [
    {
      id: "active",
      sku: "SKU-1",
      size: "M",
      color: "Чорний",
      retail_price: 1200,
      old_price: 1400,
      stock_quantity: 7,
      is_active: true,
      wholesale_price: 900,
      min_wholesale_quantity: 10,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    },
    {
      id: "inactive",
      sku: "SKU-2",
      size: "L",
      color: null,
      retail_price: 1300,
      old_price: null,
      stock_quantity: 5,
      is_active: false,
    },
  ];
  const publicVariants = toPublicProductVariants(internalVariants);

  assert.deepEqual(publicVariants, [
    {
      id: "active",
      sku: "SKU-1",
      size: "M",
      color: "Чорний",
      retail_price: 1200,
      old_price: 1400,
      is_available: true,
    },
  ]);
  for (const field of [
    "wholesale_price",
    "min_wholesale_quantity",
    "stock_quantity",
    "created_at",
    "updated_at",
    "is_active",
  ]) {
    assert.equal(field in publicVariants[0], false);
  }

  const availabilityHandler = source("./cart-availability-handler.ts");
  assert.match(availabilityHandler, /const publicValidation = validation\.map/);
  assert.doesNotMatch(
    availabilityHandler.match(/const publicValidation = validation\.map[\s\S]*?\}\);/)?.[0] ?? "",
    /stockQuantity|productStatus/
  );
});

test("all privileged admin mutation routes enforce the configured admin email", () => {
  const adminApiRoot = new URL("../app/api/admin/", import.meta.url);
  const routePaths: string[] = [];

  function collectRoutes(directory: URL) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) {
        collectRoutes(entryUrl);
      } else if (entry.name === "route.ts") {
        routePaths.push(entryUrl.pathname);
      }
    }
  }

  collectRoutes(adminApiRoot);
  const privilegedRoutes = routePaths.filter(
    (path) => !path.endsWith("/login/route.ts") && !path.endsWith("/logout/route.ts")
  );
  assert.ok(privilegedRoutes.length > 0);
  for (const path of privilegedRoutes) {
    const routeSource = readFileSync(path, "utf8");
    assert.match(routeSource, /getAdminUserFromCookieStore/);
    assert.match(routeSource, /isAdminEmail\(user\.email\)/);
  }
});

test("customer order reads remain isolated by user id and RLS", () => {
  const initialProfileMigration = source(
    "../../supabase/migrations/20260623090000_add_customer_profiles_and_order_links.sql"
  );
  const accountService = source("../services/account.service.ts");

  assert.match(initialProfileMigration, /using \(auth\.uid\(\) = user_id\)/);
  assert.match(initialProfileMigration, /orders\.user_id = auth\.uid\(\)/);
  assert.match(
    accountService,
    /getOrderForUser[\s\S]*?\.eq\("id", orderId\)[\s\S]*?\.eq\("user_id", userId\)/
  );
});

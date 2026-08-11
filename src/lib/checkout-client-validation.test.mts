import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getCheckoutClientValidationErrors,
  getFirstInvalidCheckoutField,
  mapCheckoutServerErrorToFields,
  type CheckoutClientValidationInput,
} from "./checkout-client-validation.ts";

const CHECKOUT_CLIENT_SOURCE = readFileSync(
  new URL("../components/Checkout/CheckoutClient.tsx", import.meta.url),
  "utf8"
);
const ACCOUNT_ORDERS_SOURCE = readFileSync(
  new URL("../components/Account/AccountOrdersClient.tsx", import.meta.url),
  "utf8"
);
const ADMIN_ORDER_SOURCE = readFileSync(
  new URL("../app/admin/orders/[id]/page.tsx", import.meta.url),
  "utf8"
);

function validInput(
  overrides: Partial<CheckoutClientValidationInput> = {}
): CheckoutClientValidationInput {
  return {
    firstName: "Іван",
    lastName: "Петренко",
    phone: "+380671234567",
    email: "ivan@example.com",
    deliveryService: "nova_poshta",
    deliveryMethod: "branch",
    deliveryCity: "Київ",
    deliveryCityRef: "city-ref",
    deliveryWarehouse: "Відділення №1",
    deliveryWarehouseRef: "warehouse-ref",
    deliveryAddress: "",
    comment: "",
    ...overrides,
  };
}

test("client validator returns specific contact field errors", () => {
  const cases: Array<[Partial<CheckoutClientValidationInput>, string]> = [
    [{ firstName: "" }, "Введіть ім'я."],
    [{ lastName: "" }, "Введіть прізвище."],
    [{ phone: "+380" }, "Введіть коректний номер телефону."],
    [{ email: "invalid" }, "Введіть коректний email."],
  ];

  for (const [override, expected] of cases) {
    const errors = getCheckoutClientValidationErrors(validInput(override));
    const matching = Object.values(errors).filter(Boolean);
    assert.deepEqual(matching, [expected]);
  }
});

test("client validator covers each supported delivery field", () => {
  assert.equal(
    getCheckoutClientValidationErrors(validInput({ deliveryCity: "", deliveryCityRef: null }))
      .deliveryCity,
    "Будь ласка, оберіть місто."
  );
  assert.equal(
    getCheckoutClientValidationErrors(
      validInput({ deliveryWarehouse: "", deliveryWarehouseRef: null })
    ).deliveryWarehouse,
    "Будь ласка, оберіть відділення."
  );
  assert.equal(
    getCheckoutClientValidationErrors(
      validInput({
        deliveryMethod: "locker",
        deliveryWarehouse: "",
        deliveryWarehouseRef: null,
      })
    ).deliveryWarehouse,
    "Будь ласка, оберіть поштомат."
  );
  assert.equal(
    getCheckoutClientValidationErrors(
      validInput({ deliveryMethod: "courier", deliveryAddress: "" })
    ).deliveryAddress,
    "Вкажіть адресу доставки."
  );
  assert.equal(
    getCheckoutClientValidationErrors(
      validInput({
        deliveryService: "ukrposhta",
        deliveryMethod: "branch",
        deliveryWarehouse: "",
        deliveryWarehouseRef: null,
      })
    ).deliveryWarehouse,
    "Будь ласка, оберіть відділення."
  );
});

test("one validation pass exposes all errors and selects the visual first field", () => {
  const errors = getCheckoutClientValidationErrors(
    validInput({
      firstName: "",
      lastName: "",
      phone: "+380",
      email: "bad",
      deliveryCity: "",
      deliveryCityRef: null,
      deliveryWarehouse: "",
      deliveryWarehouseRef: null,
    })
  );

  assert.deepEqual(
    Object.entries(errors)
      .filter(([, error]) => Boolean(error))
      .map(([field]) => field),
    [
      "firstName",
      "lastName",
      "phone",
      "email",
      "deliveryCity",
      "deliveryWarehouse",
    ]
  );
  assert.equal(getFirstInvalidCheckoutField(errors), "firstName");
});

test("correcting an edited value clears only that field error", () => {
  const invalid = getCheckoutClientValidationErrors(validInput({ phone: "+380" }));
  const corrected = getCheckoutClientValidationErrors(
    validInput({ phone: "+38 (067) 123-45-67" })
  );

  assert.ok(invalid.phone);
  assert.equal(corrected.phone, null);
});

test("pickup needs no browser delivery location and clears every irrelevant error", () => {
  const errors = getCheckoutClientValidationErrors(
    validInput({
      deliveryService: "pickup",
      deliveryMethod: "pickup",
      deliveryCity: "",
      deliveryCityRef: null,
      deliveryWarehouse: "",
      deliveryWarehouseRef: null,
      deliveryAddress: "",
    })
  );

  assert.equal(errors.deliveryCity, null);
  assert.equal(errors.deliveryWarehouse, null);
  assert.equal(errors.deliveryAddress, null);
  assert.ok(CHECKOUT_CLIENT_SOURCE.includes("{!isPickup ? ("));
  assert.ok(CHECKOUT_CLIENT_SOURCE.includes("deliveryCity: isPickup ? null"));
  assert.match(ACCOUNT_ORDERS_SOURCE, /isPickupDelivery[\s\S]*Самовивіз/);
  assert.match(ADMIN_ORDER_SOURCE, /isPickupDelivery[\s\S]*Самовивіз/);
});

test("local validation gates the checkout request before fetch", () => {
  const validationIndex = CHECKOUT_CLIENT_SOURCE.indexOf("if (!isFormValid)");
  const checkoutFetchIndex = CHECKOUT_CLIENT_SOURCE.indexOf(
    'fetch("/api/checkout/orders"'
  );

  assert.ok(validationIndex >= 0);
  assert.ok(checkoutFetchIndex > validationIndex);
  assert.match(CHECKOUT_CLIENT_SOURCE, /setTouched\(ALL_FIELDS_TOUCHED\)/);
  assert.match(CHECKOUT_CLIENT_SOURCE, /noValidate/);
});

test("known server validation codes map back to focusable fields", () => {
  const input = validInput({ deliveryMethod: "courier" });

  assert.deepEqual(
    mapCheckoutServerErrorToFields("CHECKOUT_INVALID_PHONE", "Телефон", input),
    { phone: "Телефон" }
  );
  assert.deepEqual(
    mapCheckoutServerErrorToFields("CHECKOUT_INVALID_EMAIL", "Email", input),
    { email: "Email" }
  );
  assert.deepEqual(
    mapCheckoutServerErrorToFields(
      "CHECKOUT_INVALID_DELIVERY",
      "Адреса доставки є обов’язковою.",
      input
    ),
    { deliveryAddress: "Адреса доставки є обов’язковою." }
  );
});

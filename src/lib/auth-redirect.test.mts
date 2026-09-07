import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getSafeAdminRedirect,
  getSafeCustomerRedirect,
} from "./auth-redirect.ts";

test("customer redirects preserve supported return destinations", () => {
  const cases = [
    "/account",
    "/account/orders",
    "/account/orders?page=2&status=paid#recent",
    "/checkout",
    "/checkout?coupon=SAVE10",
    "/checkout/success?order=order-123",
  ];

  for (const destination of cases) {
    assert.equal(getSafeCustomerRedirect(destination), destination);
  }
});

test("customer redirects reject unsupported same-site destinations", () => {
  for (const destination of ["/", "/catalog", "/login", "/api/auth/logout"]) {
    assert.equal(getSafeCustomerRedirect(destination), "/account");
  }
});

test("admin redirects preserve only the intended admin area", () => {
  const cases = [
    "/admin/orders",
    "/admin/orders?page=2&status=new#queue",
    "/admin/categories",
    "/admin/products/product-123/edit?created=1",
  ];

  for (const destination of cases) {
    assert.equal(getSafeAdminRedirect(destination), destination);
  }
});

test("admin redirects reject boundary lookalikes and public paths", () => {
  for (const destination of [
    "/administrator",
    "/admin-evil",
    "/admin.evil",
    "/admin",
    "/admin/login",
    "/admin/unknown",
    "/account",
    "/checkout",
  ]) {
    assert.equal(getSafeAdminRedirect(destination), "/admin/orders");
  }
});

test("untrusted redirect forms fail closed to each flow's final fallback", () => {
  const maliciousDestinations: unknown[] = [
    undefined,
    null,
    "",
    " ",
    "https://evil.example",
    "http://evil.example",
    "https://specwear.invalid@evil.example/account",
    "//evil.example",
    "//google.com",
    "///evil.example",
    "\\\\evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "data:text/html,evil",
    "https:%2F%2Fevil.example",
    "%2F%2Fevil.example",
    "/%2F%2Fevil.example",
    "/%252F%252Fevil.example",
    "/%5Cevil.example",
    "/%255Cevil.example",
    "/account\nevil",
    "/admin\u0000/orders",
    "/account/%E0%A4%A",
    "/admin/%",
  ];

  for (const destination of maliciousDestinations) {
    assert.equal(getSafeCustomerRedirect(destination), "/account");
    assert.equal(getSafeAdminRedirect(destination), "/admin/orders");
  }
});

test("encoded query parameters remain safe after browser-style parsing", () => {
  const customerCases = [
    ["redirectTo=%2Fcheckout%3Fcoupon%3DSAVE10", "/checkout?coupon=SAVE10"],
    ["redirectTo=%2F%2Fevil.example", "/account"],
    ["redirectTo=https%3A%2F%2Fevil.example", "/account"],
    ["redirectTo=%252F%252Fevil.example", "/account"],
    ["redirectTo=%2F%255Cevil.example", "/account"],
  ];

  for (const [query, expected] of customerCases) {
    const destination = new URL(`https://specwear.invalid/login?${query}`).searchParams.get(
      "redirectTo"
    );
    assert.equal(getSafeCustomerRedirect(destination), expected);
  }

  const adminCases = [
    ["next=%2Fadmin%2Forders%3Fpage%3D2", "/admin/orders?page=2"],
    ["next=%2F%2Fevil.example%2Fadmin", "/admin/orders"],
    ["next=%252F%252Fevil.example%252Fadmin", "/admin/orders"],
  ];

  for (const [query, expected] of adminCases) {
    const destination = new URL(
      `https://specwear.invalid/admin/login?${query}`
    ).searchParams.get("next");
    assert.equal(getSafeAdminRedirect(destination), expected);
  }
});

test("server pages and client forms all apply the shared redirect policy", () => {
  const sources = [
    "../app/login/page.tsx",
    "../app/register/page.tsx",
    "../app/admin/login/page.tsx",
    "../components/Auth/CustomerLoginForm.tsx",
    "../components/Auth/CustomerRegisterForm.tsx",
    "../components/AdminAuth/AdminLoginForm.tsx",
    "./customer-auth.ts",
  ];

  for (const relativePath of sources) {
    const fileSource = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(fileSource, /getSafe(?:Customer|Admin)Redirect/);
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clearCustomerSessionCookies,
  CUSTOMER_ACCESS_TOKEN_COOKIE,
  CUSTOMER_REFRESH_TOKEN_COOKIE,
  hasCustomerSessionCookie,
  resolveCheckoutCustomerSession,
} from "./customer-session-cookies.ts";
import { getSafeCheckoutPricingContext } from "./checkout-pricing.ts";

const LOGOUT_BUTTON_SOURCE = readFileSync(
  new URL("../components/Auth/CustomerLogoutButton.tsx", import.meta.url),
  "utf8"
);
const LOGOUT_ROUTE_SOURCE = readFileSync(
  new URL("../app/api/auth/logout/route.ts", import.meta.url),
  "utf8"
);
const CHECKOUT_ROUTE_SOURCE = readFileSync(
  new URL("../app/api/checkout/orders/route.ts", import.meta.url),
  "utf8"
);
const ADMIN_AUTH_SOURCE = readFileSync(
  new URL("./admin-auth.ts", import.meta.url),
  "utf8"
);

test("logout expires both customer cookies with the root cookie identity", () => {
  const writes: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const response = {
    cookies: {
      set(name: string, value: string, options: Record<string, unknown>) {
        writes.push({ name, value, options });
      },
    },
  };

  clearCustomerSessionCookies(response, false);

  assert.deepEqual(
    writes.map(({ name }) => name),
    [CUSTOMER_ACCESS_TOKEN_COOKIE, CUSTOMER_REFRESH_TOKEN_COOKIE]
  );
  for (const write of writes) {
    assert.equal(write.value, "");
    assert.equal(write.options.path, "/");
    assert.equal(write.options.httpOnly, true);
    assert.equal(write.options.sameSite, "lax");
    assert.equal(write.options.secure, false);
    assert.equal(write.options.maxAge, 0);
    assert.equal((write.options.expires as Date).getTime(), 0);
  }
});

test("session detection becomes guest after logout but still detects arbitrary stale tokens", () => {
  const cookies = new Map<string, string>([
    [CUSTOMER_ACCESS_TOKEN_COOKIE, "invalid-access"],
    [CUSTOMER_REFRESH_TOKEN_COOKIE, "invalid-refresh"],
  ]);
  const reader = {
    get(name: string) {
      const value = cookies.get(name);
      return value === undefined ? undefined : { value };
    },
  };

  assert.equal(hasCustomerSessionCookie(reader), true);
  cookies.delete(CUSTOMER_ACCESS_TOKEN_COOKIE);
  cookies.delete(CUSTOMER_REFRESH_TOKEN_COOKIE);
  assert.equal(hasCustomerSessionCookie(reader), false);
  cookies.set(CUSTOMER_ACCESS_TOKEN_COOKIE, "arbitrary-invalid-cookie");
  assert.equal(hasCustomerSessionCookie(reader), true);
});

test("logout UI transitions only after authoritative cookie cleanup succeeds", () => {
  const responseCheckIndex = LOGOUT_BUTTON_SOURCE.indexOf("if (!response.ok)");
  const navigationIndex = LOGOUT_BUTTON_SOURCE.indexOf('router.replace("/login")');

  assert.ok(responseCheckIndex >= 0);
  assert.ok(navigationIndex > responseCheckIndex);
  assert.match(LOGOUT_BUTTON_SOURCE, /credentials: "same-origin"/);
  assert.match(LOGOUT_ROUTE_SOURCE, /clearCustomerSessionCookies\(response\)/);
  assert.match(LOGOUT_ROUTE_SOURCE, /Cache-Control", "no-store"/);
});

test("checkout resolves a browser without customer cookies as a retail guest", () => {
  const session = resolveCheckoutCustomerSession({
    hasSessionCookie: false,
    accessToken: null,
    verifiedUserId: null,
  });

  assert.deepEqual(session, {
    status: "guest",
    userId: null,
    accessToken: null,
    shouldClearSessionCookies: false,
  });
  assert.deepEqual(getSafeCheckoutPricingContext(null), {
    customerType: "retail",
    isWholesaleApproved: false,
  });
});

test("stale, expired, malformed and refresh-only customer sessions fall back to guest", () => {
  for (const input of [
    { hasSessionCookie: true, accessToken: "expired-access", verifiedUserId: null },
    { hasSessionCookie: true, accessToken: "malformed", verifiedUserId: null },
    { hasSessionCookie: true, accessToken: null, verifiedUserId: null },
  ]) {
    const session = resolveCheckoutCustomerSession(input);

    assert.equal(session.status, "guest");
    assert.equal(session.userId, null);
    assert.equal(session.accessToken, null);
    assert.equal(session.shouldClearSessionCookies, true);
  }
});

test("an invalid former wholesale session cannot retain identity, profile or pricing privilege", () => {
  const session = resolveCheckoutCustomerSession({
    hasSessionCookie: true,
    accessToken: "expired-former-wholesale-token",
    verifiedUserId: null,
  });
  const staleProfile = {
    customer_type: "wholesale",
    is_wholesale_approved: true,
  };
  const pricingContext = getSafeCheckoutPricingContext(
    session.userId ? staleProfile : null
  );

  assert.equal(session.userId, null);
  assert.equal(session.accessToken, null);
  assert.deepEqual(pricingContext, {
    customerType: "retail",
    isWholesaleApproved: false,
  });
});

test("a valid verified customer session retains the verified identity", () => {
  assert.deepEqual(
    resolveCheckoutCustomerSession({
      hasSessionCookie: true,
      accessToken: "verified-access-token",
      verifiedUserId: "11111111-1111-4111-8111-111111111111",
    }),
    {
      status: "authenticated",
      userId: "11111111-1111-4111-8111-111111111111",
      accessToken: "verified-access-token",
      shouldClearSessionCookies: false,
    }
  );
});

test("checkout uses only resolved identity and clears invalid customer cookies", () => {
  assert.match(CHECKOUT_ROUTE_SOURCE, /resolveCheckoutCustomerSession/);
  assert.match(CHECKOUT_ROUTE_SOURCE, /const userId = customerSession\.userId/);
  assert.match(CHECKOUT_ROUTE_SOURCE, /const customerAccessToken = customerSession\.accessToken/);
  assert.match(CHECKOUT_ROUTE_SOURCE, /clearCustomerSessionCookies\(response\)/);
  assert.doesNotMatch(CHECKOUT_ROUTE_SOURCE, /assertValidCheckoutSessionAttempt/);
});

test("checkout stale-session cleanup remains separate from admin cookies", () => {
  assert.doesNotMatch(CHECKOUT_ROUTE_SOURCE, /specwear_admin_|clearAdminSessionCookies/);
  assert.match(ADMIN_AUTH_SOURCE, /specwear_admin_access_token/);
  assert.match(ADMIN_AUTH_SOURCE, /specwear_admin_refresh_token/);
});

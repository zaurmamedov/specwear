import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clearCustomerSessionCookies,
  CUSTOMER_ACCESS_TOKEN_COOKIE,
  CUSTOMER_REFRESH_TOKEN_COOKIE,
  hasCustomerSessionCookie,
} from "./customer-session-cookies.ts";

const LOGOUT_BUTTON_SOURCE = readFileSync(
  new URL("../components/Auth/CustomerLogoutButton.tsx", import.meta.url),
  "utf8"
);
const LOGOUT_ROUTE_SOURCE = readFileSync(
  new URL("../app/api/auth/logout/route.ts", import.meta.url),
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

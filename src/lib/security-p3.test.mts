import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import sharp from "sharp";

import nextConfig from "../../next.config.ts";
import {
  normalizeProductImage,
  PRODUCT_IMAGE_MAX_FILE_BYTES,
  ProductImageUploadError,
} from "./security/product-image-upload.ts";
import {
  readBoundedJson,
  SafeRequestError,
  validateSameOrigin,
} from "./security/request.ts";
import {
  createTurnstileVerificationBody,
  getTurnstileRemoteIp,
} from "./security/turnstile-request.ts";
import {
  deliverOrderTelegramMessages,
  TELEGRAM_OUTBOUND_TIMEOUT_MS,
} from "./telegram-order-message.ts";

function mutationRequest(origin?: string, secFetchSite?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (origin !== undefined) headers.set("Origin", origin);
  if (secFetchSite !== undefined) headers.set("Sec-Fetch-Site", secFetchSite);

  return new Request("https://specwear-git-development-team.vercel.app/api/test", {
    method: "POST",
    headers,
    body: "{}",
  });
}

test("origin policy accepts exact localhost/preview origins and rejects unsafe forms", () => {
  assert.equal(
    validateSameOrigin(mutationRequest("https://specwear-git-development-team.vercel.app")),
    null
  );
  const local = new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers: { Origin: "http://localhost:3000" },
  });
  assert.equal(validateSameOrigin(local), null);

  for (const request of [
    mutationRequest(),
    mutationRequest("https://evil.example"),
    mutationRequest("null"),
    mutationRequest("not a url"),
    mutationRequest("https://specwear-git-development-team.vercel.app", "cross-site"),
  ]) {
    assert.equal(validateSameOrigin(request)?.status, 403);
  }
});

test("bounded JSON rejects content-type, malformed and oversized bodies", async () => {
  await assert.rejects(
    readBoundedJson(new Request("https://example.test", { method: "POST", body: "{}" }), 10),
    (error: unknown) => error instanceof SafeRequestError && error.status === 415
  );
  await assert.rejects(
    readBoundedJson(
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      10
    ),
    (error: unknown) => error instanceof SafeRequestError && error.status === 400
  );
  await assert.rejects(
    readBoundedJson(
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "too large" }),
      }),
      10
    ),
    (error: unknown) => error instanceof SafeRequestError && error.status === 413
  );
});

test("admin image processing validates bytes and emits a real bounded WebP", async () => {
  const png = await sharp({
    create: {
      width: 3_000,
      height: 1_000,
      channels: 3,
      background: "#123456",
    },
  }).png().toBuffer();
  const output = await normalizeProductImage(
    new File([new Uint8Array(png)], "user-controlled-name.png", { type: "image/png" })
  );
  const metadata = await sharp(output).metadata();

  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 2_000);
  assert.ok((metadata.height ?? 0) <= 2_000);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);

  await assert.rejects(
    normalizeProductImage(
      new File(["<svg><script>alert(1)</script></svg>"], "fake.png", {
        type: "image/png",
      })
    ),
    ProductImageUploadError
  );
  await assert.rejects(
    normalizeProductImage(
      new File([new Uint8Array(PRODUCT_IMAGE_MAX_FILE_BYTES + 1)], "large.webp", {
        type: "image/webp",
      })
    ),
    (error: unknown) =>
      error instanceof ProductImageUploadError && error.status === 413
  );
});

test("spoofed forwarding headers cannot populate Turnstile remoteip", () => {
  const request = new Request("https://specwear.example/api/checkout/orders", {
    headers: {
      "cf-connecting-ip": "203.0.113.1",
      "x-forwarded-for": "203.0.113.2, 10.0.0.1",
      "x-real-ip": "203.0.113.3",
    },
  });
  const remoteIp = getTurnstileRemoteIp(request);
  const body = createTurnstileVerificationBody({
    secret: "test-secret",
    token: "test-token",
    remoteIp,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(remoteIp, undefined);
  assert.equal(body.has("remoteip"), false);
  assert.equal(body.get("response"), "test-token");
  assert.match(body.get("idempotency_key") ?? "", /^[0-9a-f-]{36}$/);
});

test("Telegram times out safely and never logs provider body or credentials", async () => {
  assert.equal(TELEGRAM_OUTBOUND_TIMEOUT_MS, 5_000);
  const logs: unknown[] = [];
  let calls = 0;

  await deliverOrderTelegramMessages(
    ["first", "second"],
    { token: "secret-token", chatId: "secret-chat" },
    {
      timeoutMs: 5,
      fetcher: ((_input: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("secret-token", "AbortError")));
        });
      }) as typeof fetch,
      logError: (_message, detail) => logs.push(detail),
    }
  );

  assert.equal(calls, 1);
  assert.deepEqual(logs, [{ reason: "timeout" }]);

  const providerLogs: unknown[] = [];
  await deliverOrderTelegramMessages(
    ["message"],
    { token: "secret-token", chatId: "secret-chat" },
    {
      fetcher: async () => new Response("RAW_PROVIDER_SECRET", { status: 500 }),
      logError: (_message, detail) => providerLogs.push(detail),
    }
  );
  assert.deepEqual(providerLogs, [{ status: 500 }]);
});

test("security headers include a compatible report-only CSP and sensitive no-store rules", async () => {
  const headersFunction = nextConfig.headers;
  assert.equal(typeof headersFunction, "function");
  const rules = await headersFunction!();
  const globalHeaders = new Map(rules[0]?.headers.map(({ key, value }) => [key, value]));
  const csp = globalHeaders.get("Content-Security-Policy-Report-Only") ?? "";

  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(globalHeaders.get("X-Content-Type-Options"), "nosniff");
  assert.equal(globalHeaders.get("X-Frame-Options"), "DENY");
  assert.ok(rules.some((rule) => rule.source === "/api/admin/:path*"));
  assert.ok(rules.some((rule) => rule.source === "/api/account/:path*"));
});

test("all browser state-changing authenticated routes invoke the shared origin policy", () => {
  const routes = [
    "../app/api/auth/login/route.ts",
    "../app/api/auth/register/route.ts",
    "../app/api/auth/logout/route.ts",
    "../app/api/admin/login/route.ts",
    "../app/api/admin/logout/route.ts",
    "../app/api/account/profile/route.ts",
    "../app/api/account/orders/[id]/repeat/route.ts",
    "../app/api/checkout/orders/route.ts",
    "../app/api/admin/categories/route.ts",
    "../app/api/admin/categories/[id]/route.ts",
    "../app/api/admin/orders/[id]/route.ts",
    "../app/api/admin/products/route.ts",
    "../app/api/admin/products/[id]/route.ts",
    "../app/api/admin/products/[id]/images/route.ts",
    "../app/api/admin/products/[id]/variants/route.ts",
    "../app/api/admin/product-images/[imageId]/route.ts",
    "../app/api/admin/variants/[variantId]/route.ts",
  ];

  for (const route of routes) {
    assert.match(readFileSync(new URL(route, import.meta.url), "utf8"), /validateSameOrigin\(request\)/, route);
  }
});

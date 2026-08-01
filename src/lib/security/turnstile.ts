import "server-only";

import { createHash } from "node:crypto";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 8000;

type TurnstileVerifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

export type TurnstileVerificationResult = {
  success: boolean;
  error: string | null;
};

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function createTurnstileVerificationIdempotencyKey(
  checkoutIdempotencyKey: string,
  token: string
) {
  const bytes = createHash("sha256")
    .update(`${checkoutIdempotencyKey}:${token}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getTurnstileRemoteIp(request: Request) {
  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const firstForwardedIp = forwardedFor
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);

    if (firstForwardedIp) {
      return firstForwardedIp;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || undefined;
}

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string,
  idempotencyKey?: string
): Promise<TurnstileVerificationResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  if (isDevelopment() && (!secretKey || !siteKey)) {
    return {
      success: true,
      error:
        "Turnstile keys are incomplete in development. Verification bypassed locally.",
    };
  }

  if (!secretKey) {
    return {
      success: false,
      error: "TURNSTILE_SECRET_KEY is not configured.",
    };
  }

  const normalizedToken = token?.trim() ?? "";

  if (!normalizedToken) {
    return {
      success: false,
      error: "Turnstile token is missing.",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);

  try {
    const body = new URLSearchParams({
      secret: secretKey,
      response: normalizedToken,
    });

    if (remoteIp) {
      body.set("remoteip", remoteIp);
    }

    if (idempotencyKey) {
      body.set(
        "idempotency_key",
        createTurnstileVerificationIdempotencyKey(
          idempotencyKey,
          normalizedToken
        )
      );
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Turnstile verification request failed with status ${response.status}.`,
      };
    }

    const payload = (await response.json()) as TurnstileVerifyResponse;

    if (!payload.success) {
      const errorCodes = payload["error-codes"]?.join(", ") ?? "unknown";

      return {
        success: false,
        error: `Turnstile verification was rejected. Error codes: ${errorCodes}.`,
      };
    }

    return {
      success: true,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? `Turnstile verification request failed: ${error.message}`
          : "Turnstile verification request failed.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

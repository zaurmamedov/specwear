import "server-only";

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
  remoteIp?: string
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

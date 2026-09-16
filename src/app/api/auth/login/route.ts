import { NextResponse } from "next/server";

import {
  createServerSupabaseCustomerAuthClient,
  setCustomerSessionCookies,
} from "@/lib/customer-auth";
import { TURNSTILE_FAILURE_MESSAGE } from "@/lib/security/turnstile.shared";
import {
  isBoundedString,
  readBoundedJsonObject,
  safeRequestErrorResponse,
  validateSameOrigin,
} from "@/lib/security/request";

const SUPABASE_CAPTCHA_FAILURE_MESSAGE =
  "Не вдалося пройти перевірку безпеки. Оновіть сторінку і спробуйте ще раз.";

function isSupabaseCaptchaError(message: string | undefined) {
  const normalizedMessage = message?.toLowerCase() ?? "";

  return (
    normalizedMessage.includes("captcha") ||
    normalizedMessage.includes("turnstile") ||
    normalizedMessage.includes("security verification")
  );
}

export async function POST(request: Request) {
  const invalidOrigin = validateSameOrigin(request);
  if (invalidOrigin) return invalidOrigin;

  try {
    const body = (await readBoundedJsonObject(request, 8 * 1024)) as {
      email?: string;
      password?: string;
      turnstileToken?: string;
    };

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const turnstileToken =
      typeof body.turnstileToken === "string" ? body.turnstileToken.trim() : "";

    if (
      !email ||
      !password ||
      !isBoundedString(email, 254) ||
      !isBoundedString(password, 1_024) ||
      !isBoundedString(turnstileToken, 2_048)
    ) {
      return NextResponse.json({ error: "Вкажіть email і пароль." }, { status: 400 });
    }

    if (!turnstileToken) {
      return NextResponse.json({ error: TURNSTILE_FAILURE_MESSAGE }, { status: 400 });
    }

    const supabase = createServerSupabaseCustomerAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        captchaToken: turnstileToken,
      },
    });

    if (error || !data.session || !data.user) {
      if (isSupabaseCaptchaError(error?.message)) {
        return NextResponse.json(
          { error: SUPABASE_CAPTCHA_FAILURE_MESSAGE },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: "Невірний email або пароль." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ success: true });
    setCustomerSessionCookies(response, data.session);
    return response;
  } catch (error) {
    return safeRequestErrorResponse(error, "Не вдалося виконати вхід.");
  }
}

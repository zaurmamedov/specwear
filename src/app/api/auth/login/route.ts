import { NextResponse } from "next/server";

import {
  createServerSupabaseCustomerAuthClient,
  setCustomerSessionCookies,
} from "@/lib/customer-auth";
import { TURNSTILE_FAILURE_MESSAGE } from "@/lib/security/turnstile.shared";

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
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      turnstileToken?: string;
    };

    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
    const turnstileToken = body.turnstileToken?.trim() ?? "";

    if (!email || !password) {
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
  } catch {
    return NextResponse.json({ error: "Не вдалося виконати вхід." }, { status: 500 });
  }
}

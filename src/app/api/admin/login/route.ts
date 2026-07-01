import { NextResponse } from "next/server";

import {
  clearAdminSessionCookies,
  createServerSupabaseAuthClient,
  isAdminEmail,
  setAdminSessionCookies,
} from "@/lib/admin-auth";
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
      return NextResponse.json(
        { error: "Вкажіть email і пароль." },
        { status: 400 }
      );
    }

    if (!turnstileToken) {
      return NextResponse.json({ error: TURNSTILE_FAILURE_MESSAGE }, { status: 400 });
    }

    const supabase = createServerSupabaseAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        captchaToken: turnstileToken,
      },
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("Admin login captcha/auth diagnostic", {
        hasTurnstileToken: Boolean(turnstileToken),
        supabaseAuthErrorMessage: error?.message ?? null,
        supabaseAuthErrorCode: error?.code ?? null,
        supabaseAuthErrorStatus: error?.status ?? null,
      });
    }

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

    if (process.env.NODE_ENV !== "production") {
      console.log("Admin login identity check", {
        userEmail: data.user.email ?? null,
        hasAdminEmail: Boolean(process.env.ADMIN_EMAIL?.trim()),
      });
    }

    if (!isAdminEmail(data.user.email)) {
      const response = NextResponse.json(
        { error: "У вас немає доступу до адмін-панелі." },
        { status: 403 }
      );
      clearAdminSessionCookies(response);
      return response;
    }

    const response = NextResponse.json({ success: true });
    setAdminSessionCookies(response, data.session);

    return response;
  } catch {
    return NextResponse.json(
      { error: "Не вдалося виконати вхід." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";

import {
  createServerSupabaseCustomerAuthClient,
  setCustomerSessionCookies,
} from "@/lib/customer-auth";
import { TURNSTILE_FAILURE_MESSAGE } from "@/lib/security/turnstile.shared";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import { upsertProfileForUser } from "@/services/account.service";

const SUPABASE_CAPTCHA_FAILURE_MESSAGE =
  "Не вдалося пройти перевірку безпеки. Оновіть сторінку і спробуйте ще раз.";
const EMAIL_CONFIRMATION_MESSAGE =
  "Ми надіслали лист для підтвердження реєстрації. Перевірте вашу пошту.";

function logRegisterDev(message: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.log(message, payload);
}

function mapRegisterError(message: string | undefined) {
  const normalizedMessage = message?.toLowerCase() ?? "";

  if (isSupabaseCaptchaError(message)) {
    return SUPABASE_CAPTCHA_FAILURE_MESSAGE;
  }

  if (
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("too many requests") ||
    normalizedMessage.includes("email rate limit")
  ) {
    return "Перевищено ліміт відправки листів. Спробуйте пізніше.";
  }

  if (
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("user already registered") ||
    normalizedMessage.includes("already been registered")
  ) {
    return "Користувач із таким email уже існує.";
  }

  if (normalizedMessage.includes("password")) {
    return "Пароль має містити щонайменше 8 символів.";
  }

  if (
    normalizedMessage.includes("invalid email") ||
    normalizedMessage.includes("email address is invalid") ||
    normalizedMessage.includes("unable to validate email address") ||
    normalizedMessage.includes("email is invalid")
  ) {
    return "Введіть коректний email.";
  }

  return "Не вдалося створити акаунт. Спробуйте ще раз.";
}

function validatePhone(phone: string) {
  return /^\+380\d{9}$/.test(phone.trim());
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

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
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
      password?: string;
      turnstileToken?: string;
    };

    const firstName = body.firstName?.trim() ?? "";
    const lastName = body.lastName?.trim() ?? "";
    const phone = body.phone?.trim() ?? "";
    const submittedEmail = body.email ?? "";
    const email = submittedEmail.trim();
    const normalizedEmail = email.toLowerCase();
    const password = body.password ?? "";
    const turnstileToken = body.turnstileToken?.trim() ?? "";
    const isEmailValid = validateEmail(normalizedEmail);

    logRegisterDev("Register request validation", {
      submittedEmail,
      normalizedEmail,
      emailRegexValid: isEmailValid,
    });

    if (!turnstileToken) {
      return NextResponse.json({ error: TURNSTILE_FAILURE_MESSAGE }, { status: 400 });
    }

    if (!firstName) {
      return NextResponse.json({ error: "Введіть ім'я" }, { status: 400 });
    }

    if (!lastName) {
      return NextResponse.json({ error: "Введіть прізвище" }, { status: 400 });
    }

    if (!validatePhone(phone)) {
      return NextResponse.json(
        { error: "Введіть коректний номер телефону" },
        { status: 400 }
      );
    }

    if (!isEmailValid) {
      return NextResponse.json({ error: "Введіть коректний email" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Пароль має містити щонайменше 8 символів" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseCustomerAuthClient();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        captchaToken: turnstileToken,
        data: {
          first_name: firstName,
          last_name: lastName,
          phone,
        },
      },
    });

    logRegisterDev("Register signUp result", {
      signUpSuccess: !error && Boolean(data.user),
      hasUser: Boolean(data.user),
      hasSession: Boolean(data.session),
      submittedEmail,
      normalizedEmail,
      emailRegexValid: isEmailValid,
      signUpErrorMessage: error?.message ?? null,
      signUpErrorCode: "code" in (error ?? {}) ? (error as { code?: string }).code ?? null : null,
      signUpErrorStatus:
        "status" in (error ?? {}) ? (error as { status?: number }).status ?? null : null,
    });

    if (error || !data.user) {
      return NextResponse.json({ error: mapRegisterError(error?.message) }, { status: 400 });
    }

    const session = data.session ?? null;

      const profilePayload = {
        id: data.user.id,
      email: data.user.email ?? normalizedEmail,
      first_name: firstName,
      last_name: lastName,
      phone,
      customer_type: "retail" as const,
    };

    if (session?.access_token) {
      try {
        await upsertProfileForUser(
          {
            id: data.user.id,
            email: data.user.email ?? normalizedEmail,
          },
          {
            first_name: firstName,
            last_name: lastName,
            phone,
            customer_type: "retail",
          },
          session.access_token
        );
      } catch (profileError) {
        logRegisterDev("Register profile upsert failed", {
          profileCreateErrorMessage:
            profileError instanceof Error ? profileError.message : "Unknown profile error",
          profileCreateErrorCode: null,
          profileCreateErrorStatus: null,
          hasSession: true,
        });

        try {
          const adminSupabase = createServerSupabaseAdminClient();
          const { error: fallbackError } = await adminSupabase.from("profiles").upsert(
            profilePayload,
            {
              onConflict: "id",
            }
          );

          if (fallbackError) {
            logRegisterDev("Register profile service-role fallback failed", {
              profileCreateErrorMessage: fallbackError.message,
              profileCreateErrorCode:
                "code" in fallbackError
                  ? (fallbackError as { code?: string }).code ?? null
                  : null,
              profileCreateErrorStatus:
                "status" in fallbackError
                  ? (fallbackError as { status?: number }).status ?? null
                  : null,
              hasSession: true,
            });
          }
        } catch (fallbackError) {
          logRegisterDev("Register profile fallback threw", {
            profileCreateErrorMessage:
              fallbackError instanceof Error ? fallbackError.message : "Unknown fallback error",
            profileCreateErrorCode: null,
            profileCreateErrorStatus: null,
            hasSession: true,
          });
        }
      }
    } else {
      try {
        const adminSupabase = createServerSupabaseAdminClient();
        const { error: profileError } = await adminSupabase.from("profiles").upsert(
          profilePayload,
          {
            onConflict: "id",
          }
        );

        if (profileError) {
          logRegisterDev("Register profile create skipped on email confirmation", {
            profileCreateErrorMessage: profileError.message,
            profileCreateErrorCode:
              "code" in profileError
                ? (profileError as { code?: string }).code ?? null
                : null,
            profileCreateErrorStatus:
              "status" in profileError
                ? (profileError as { status?: number }).status ?? null
                : null,
            hasSession: false,
          });
        }
      } catch (profileError) {
        logRegisterDev("Register profile create threw on email confirmation", {
          profileCreateErrorMessage:
            profileError instanceof Error ? profileError.message : "Unknown profile error",
          profileCreateErrorCode: null,
          profileCreateErrorStatus: null,
          hasSession: false,
        });
      }
    }

    const requiresEmailConfirmation = !session;
    const response = NextResponse.json({
      ok: true,
      requiresEmailConfirmation,
      message: requiresEmailConfirmation ? EMAIL_CONFIRMATION_MESSAGE : undefined,
    });

    if (session) {
      setCustomerSessionCookies(response, session);
    }

    return response;
  } catch (error) {
    logRegisterDev("Register route threw", {
      routeErrorMessage: error instanceof Error ? error.message : "Unknown route error",
    });
    return NextResponse.json({ error: "Не вдалося створити акаунт." }, { status: 500 });
  }
}

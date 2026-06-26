import { NextResponse } from "next/server";

import {
  createServerSupabaseCustomerAuthClient,
  setCustomerSessionCookies,
} from "@/lib/customer-auth";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import { upsertProfileForUser } from "@/services/account.service";

function validatePhone(phone: string) {
  return /^\+380\d{9}$/.test(phone.trim());
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
      password?: string;
    };

    const firstName = body.firstName?.trim() ?? "";
    const lastName = body.lastName?.trim() ?? "";
    const phone = body.phone?.trim() ?? "";
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";

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

    if (!validateEmail(email)) {
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
      email,
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "Не вдалося створити акаунт." },
        { status: 400 }
      );
    }

    let session = data.session ?? null;

    if (!session) {
      const signInResult = await supabase.auth.signInWithPassword({ email, password });
      session = signInResult.data.session ?? null;
    }

    if (session?.access_token) {
      await upsertProfileForUser(
        {
          id: data.user.id,
          email: data.user.email ?? email,
        },
        {
          first_name: firstName,
          last_name: lastName,
          phone,
          customer_type: "retail",
        },
        session.access_token
      );
    } else {
      const adminSupabase = createServerSupabaseAdminClient();
      const { error: profileError } = await adminSupabase.from("profiles").upsert(
        {
          id: data.user.id,
          email: data.user.email ?? email,
          first_name: firstName,
          last_name: lastName,
          phone,
          customer_type: "retail",
        },
        {
          onConflict: "id",
        }
      );

      if (profileError) {
        throw new Error(profileError.message);
      }
    }

    const response = NextResponse.json({ success: true });

    if (session) {
      setCustomerSessionCookies(response, session);
    }

    return response;
  } catch {
    return NextResponse.json({ error: "Не вдалося створити акаунт." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import {
  clearAdminSessionCookies,
  createServerSupabaseAuthClient,
  isAdminEmail,
  setAdminSessionCookies,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };

    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Вкажіть email і пароль." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "Невірний email або пароль." },
        { status: 401 }
      );
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

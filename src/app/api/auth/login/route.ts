import { NextResponse } from "next/server";

import {
  createServerSupabaseCustomerAuthClient,
  setCustomerSessionCookies,
} from "@/lib/customer-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };

    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Вкажіть email і пароль." }, { status: 400 });
    }

    const supabase = createServerSupabaseCustomerAuthClient();
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

    const response = NextResponse.json({ success: true });
    setCustomerSessionCookies(response, data.session);
    return response;
  } catch {
    return NextResponse.json({ error: "Не вдалося виконати вхід." }, { status: 500 });
  }
}

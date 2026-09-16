import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getCustomerUserFromCookieStore } from "@/lib/customer-auth";
import { getProfileByUserId } from "@/services/account.service";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const user = await getCustomerUserFromCookieStore(cookieStore);

    if (!user) {
      return NextResponse.json(
        { authenticated: false },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const profile = await getProfileByUserId(user.id);

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          email: user.email ?? null,
          firstName: profile?.first_name ?? null,
          lastName: profile?.last_name ?? null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Не вдалося перевірити сесію." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

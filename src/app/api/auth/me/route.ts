import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getCustomerUserFromCookieStore } from "@/lib/customer-auth";
import { getProfileByUserId } from "@/services/account.service";

export async function GET() {
  const cookieStore = await cookies();
  const user = await getCustomerUserFromCookieStore(cookieStore);

  if (!user) {
    return NextResponse.json({ authenticated: false });
  }

  const profile = await getProfileByUserId(user.id);

  return NextResponse.json({
    authenticated: true,
    user: {
      email: user.email ?? null,
      firstName: profile?.first_name ?? null,
      lastName: profile?.last_name ?? null,
    },
  });
}

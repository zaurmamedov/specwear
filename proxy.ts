import { NextResponse, type NextRequest } from "next/server";

import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  ADMIN_REFRESH_TOKEN_COOKIE,
  clearAdminSessionCookies,
  createServerSupabaseAuthClient,
  isAdminEmail,
  setAdminSessionCookies,
} from "@/lib/admin-auth";

function redirectToLogin(request: NextRequest, error: "unauthorized" | "forbidden") {
  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("error", error);
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );

  const response = NextResponse.redirect(loginUrl);
  clearAdminSessionCookies(response);
  return response;
}

export async function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value ?? null;
  const refreshToken = request.cookies.get(ADMIN_REFRESH_TOKEN_COOKIE)?.value ?? null;

  if (!accessToken && !refreshToken) {
    return redirectToLogin(request, "unauthorized");
  }

  const supabase = createServerSupabaseAuthClient();
  let user = null;
  let refreshedSession = null;

  if (accessToken) {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser(accessToken);
    user = currentUser;
  }

  if (!user && refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (!error && data.user && data.session) {
      user = data.user;
      refreshedSession = data.session;
    }
  }

  if (!user) {
    return redirectToLogin(request, "unauthorized");
  }

  if (!isAdminEmail(user.email)) {
    return redirectToLogin(request, "forbidden");
  }

  const response = NextResponse.next();

  if (refreshedSession) {
    setAdminSessionCookies(response, refreshedSession);
  }

  return response;
}

export const config = {
  matcher: ["/admin/orders/:path*", "/admin/products/:path*"],
};

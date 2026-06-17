import { createClient } from "@supabase/supabase-js";
import type { Session, User } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_ACCESS_TOKEN_COOKIE = "specwear_admin_access_token";
export const ADMIN_REFRESH_TOKEN_COOKIE = "specwear_admin_refresh_token";

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }

  return url;
}

function getPublishableKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not configured.");
  }

  return key;
}

function getAdminEmail() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!adminEmail) {
    throw new Error("ADMIN_EMAIL is not configured.");
  }

  return adminEmail;
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return email.trim().toLowerCase() === getAdminEmail();
}

export function createServerSupabaseAuthClient() {
  return createClient(getSupabaseUrl(), getPublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function setAdminSessionCookies(response: NextResponse, session: Session) {
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(ADMIN_ACCESS_TOKEN_COOKIE, session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: session.expires_in ?? 60 * 60,
  });

  response.cookies.set(ADMIN_REFRESH_TOKEN_COOKIE, session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearAdminSessionCookies(response: NextResponse) {
  response.cookies.set(ADMIN_ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  response.cookies.set(ADMIN_REFRESH_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getAdminUserFromCookieStore(cookieStore: CookieReader) {
  const accessToken = cookieStore.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value ?? null;

  if (!accessToken) {
    return null;
  }

  const supabase = createServerSupabaseAuthClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  return user;
}

export async function requireAdminUser() {
  const cookieStore = await cookies();
  const user = await getAdminUserFromCookieStore(cookieStore);

  if (!user) {
    redirect("/admin/login?error=unauthorized");
  }

  if (!isAdminEmail(user.email)) {
    redirect("/admin/login?error=forbidden");
  }

  return user as User;
}

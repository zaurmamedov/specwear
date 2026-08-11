import { createClient } from "@supabase/supabase-js";
import type { Session, User } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  CUSTOMER_ACCESS_TOKEN_COOKIE,
  CUSTOMER_REFRESH_TOKEN_COOKIE,
  getCustomerSessionCookieOptions,
  type CustomerCookieReader,
} from "./customer-session-cookies";

export {
  clearCustomerSessionCookies,
  CUSTOMER_ACCESS_TOKEN_COOKIE,
  CUSTOMER_REFRESH_TOKEN_COOKIE,
  hasCustomerSessionCookie,
} from "./customer-session-cookies";

type CookieReader = CustomerCookieReader;

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

export function createServerSupabaseCustomerDataClient(accessToken: string) {
  return createClient(getSupabaseUrl(), getPublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function createServerSupabaseCustomerAuthClient() {
  return createClient(getSupabaseUrl(), getPublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function setCustomerSessionCookies(response: NextResponse, session: Session) {
  const secure = process.env.NODE_ENV === "production";
  const cookieOptions = getCustomerSessionCookieOptions(secure);

  response.cookies.set(CUSTOMER_ACCESS_TOKEN_COOKIE, session.access_token, {
    ...cookieOptions,
    maxAge: session.expires_in ?? 60 * 60,
  });

  response.cookies.set(CUSTOMER_REFRESH_TOKEN_COOKIE, session.refresh_token, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getCustomerUserFromCookieStore(cookieStore: CookieReader) {
  const accessToken = cookieStore.get(CUSTOMER_ACCESS_TOKEN_COOKIE)?.value ?? null;

  if (!accessToken) {
    return null;
  }

  const supabase = createServerSupabaseCustomerAuthClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  return user;
}

export function getCustomerAccessTokenFromCookieStore(cookieStore: CookieReader) {
  return cookieStore.get(CUSTOMER_ACCESS_TOKEN_COOKIE)?.value ?? null;
}

export async function createServerSupabaseCustomerDataClientFromCookies() {
  const cookieStore = await cookies();
  const accessToken = getCustomerAccessTokenFromCookieStore(cookieStore);

  if (!accessToken) {
    return null;
  }

  return createServerSupabaseCustomerDataClient(accessToken);
}

export async function getOptionalCustomerUser() {
  const cookieStore = await cookies();
  return getCustomerUserFromCookieStore(cookieStore);
}

export async function requireCustomerUser(redirectTo = "/account") {
  const cookieStore = await cookies();
  const user = await getCustomerUserFromCookieStore(cookieStore);

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return user as User;
}

export const CUSTOMER_ACCESS_TOKEN_COOKIE = "specwear_customer_access_token";
export const CUSTOMER_REFRESH_TOKEN_COOKIE = "specwear_customer_refresh_token";

export type CustomerCookieReader = {
  get(name: string): { value: string } | undefined;
};

type CheckoutCustomerSessionInput = {
  hasSessionCookie: boolean;
  accessToken: string | null;
  verifiedUserId: string | null;
};

export type CheckoutCustomerSession =
  | {
      status: "guest";
      userId: null;
      accessToken: null;
      shouldClearSessionCookies: boolean;
    }
  | {
      status: "authenticated";
      userId: string;
      accessToken: string;
      shouldClearSessionCookies: false;
    };

type CustomerCookieWriter = {
  cookies: {
    set(
      name: string,
      value: string,
      options: {
        httpOnly: boolean;
        sameSite: "lax";
        secure: boolean;
        path: "/";
        maxAge: number;
        expires?: Date;
      }
    ): unknown;
  };
};

export function getCustomerSessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/" as const,
  };
}

export function clearCustomerSessionCookies(
  response: CustomerCookieWriter,
  secure = process.env.NODE_ENV === "production"
) {
  const expiredOptions = {
    ...getCustomerSessionCookieOptions(secure),
    maxAge: 0,
    expires: new Date(0),
  };

  response.cookies.set(CUSTOMER_ACCESS_TOKEN_COOKIE, "", expiredOptions);
  response.cookies.set(CUSTOMER_REFRESH_TOKEN_COOKIE, "", expiredOptions);
}

export function hasCustomerSessionCookie(cookieStore: CustomerCookieReader) {
  const accessToken = cookieStore.get(CUSTOMER_ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(CUSTOMER_REFRESH_TOKEN_COOKIE)?.value;

  return Boolean(accessToken?.trim() || refreshToken?.trim());
}

export function resolveCheckoutCustomerSession({
  hasSessionCookie,
  accessToken,
  verifiedUserId,
}: CheckoutCustomerSessionInput): CheckoutCustomerSession {
  if (accessToken && verifiedUserId) {
    return {
      status: "authenticated",
      userId: verifiedUserId,
      accessToken,
      shouldClearSessionCookies: false,
    };
  }

  return {
    status: "guest",
    userId: null,
    accessToken: null,
    shouldClearSessionCookies: hasSessionCookie,
  };
}

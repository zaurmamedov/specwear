const INTERNAL_REDIRECT_ORIGIN = "https://specwear.invalid";
const CUSTOMER_REDIRECT_FALLBACK = "/account";
const ADMIN_REDIRECT_FALLBACK = "/admin/orders";
const ADMIN_REDIRECT_ROOTS = [
  "/admin/orders",
  "/admin/products",
  "/admin/categories",
] as const;
const MAX_DECODE_PASSES = 8;
const UNSAFE_URL_CHARACTERS = /[\\\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

function parseInternalRedirect(destination: unknown) {
  if (
    typeof destination !== "string" ||
    destination.length === 0 ||
    destination !== destination.trim()
  ) {
    return null;
  }

  let decodedDestination = destination;

  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    if (
      decodedDestination[0] !== "/" ||
      decodedDestination[1] === "/" ||
      UNSAFE_URL_CHARACTERS.test(decodedDestination)
    ) {
      return null;
    }

    let parsedDestination: URL;

    try {
      parsedDestination = new URL(decodedDestination, INTERNAL_REDIRECT_ORIGIN);
    } catch {
      return null;
    }

    if (
      parsedDestination.origin !== INTERNAL_REDIRECT_ORIGIN ||
      parsedDestination.username ||
      parsedDestination.password
    ) {
      return null;
    }

    let nextDecodedDestination: string;

    try {
      nextDecodedDestination = decodeURIComponent(decodedDestination);
    } catch {
      return null;
    }

    if (nextDecodedDestination === decodedDestination) {
      const normalizedDestination = new URL(destination, INTERNAL_REDIRECT_ORIGIN);
      return `${normalizedDestination.pathname}${normalizedDestination.search}${normalizedDestination.hash}`;
    }

    decodedDestination = nextDecodedDestination;
  }

  return null;
}

function isRouteWithin(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function getSafeCustomerRedirect(destination: unknown) {
  const parsedDestination = parseInternalRedirect(destination);

  if (!parsedDestination) {
    return CUSTOMER_REDIRECT_FALLBACK;
  }

  const { pathname } = new URL(parsedDestination, INTERNAL_REDIRECT_ORIGIN);

  return isRouteWithin(pathname, "/account") || isRouteWithin(pathname, "/checkout")
    ? parsedDestination
    : CUSTOMER_REDIRECT_FALLBACK;
}

export function getSafeAdminRedirect(destination: unknown) {
  const parsedDestination = parseInternalRedirect(destination);

  if (!parsedDestination) {
    return ADMIN_REDIRECT_FALLBACK;
  }

  const { pathname } = new URL(parsedDestination, INTERNAL_REDIRECT_ORIGIN);

  return ADMIN_REDIRECT_ROOTS.some((root) => isRouteWithin(pathname, root))
    ? parsedDestination
    : ADMIN_REDIRECT_FALLBACK;
}

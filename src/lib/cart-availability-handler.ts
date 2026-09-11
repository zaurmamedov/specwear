import {
  parseAvailabilityItems,
  PublicApiValidationError,
  readBoundedJsonRequest,
} from "./public-api-validation.ts";

type PrivateAvailabilityResult = {
  productId: string;
  variantId: string | null;
  isAvailable: boolean;
  status: "ok" | "unavailable";
  message: string | null;
};

type ValidateCartItems = (
  items: ReturnType<typeof parseAvailabilityItems>
) => Promise<PrivateAvailabilityResult[]>;

function availabilityJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");

  return Response.json(body, { ...init, headers });
}

export async function handleCartAvailabilityRequest(
  request: Request,
  validateCartItems: ValidateCartItems,
  options: { requestId?: string; logDependencyFailure?: (requestId: string) => void } = {}
) {
  const requestId = options.requestId ?? crypto.randomUUID();

  try {
    const body = await readBoundedJsonRequest(request);
    const items = parseAvailabilityItems(body);
    const validation = await validateCartItems(items);

    const publicValidation = validation.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      isAvailable: item.isAvailable,
      status: item.status,
      message: item.message,
    }));

    return availabilityJson({
      items: publicValidation,
      hasUnavailableItems: validation.some((item) => !item.isAvailable),
    });
  } catch (error) {
    if (error instanceof PublicApiValidationError) {
      return availabilityJson(
        { error: error.message },
        { status: error.status }
      );
    }

    options.logDependencyFailure?.(requestId);

    return availabilityJson(
      {
        error: "Не вдалося перевірити доступність товарів. Спробуйте ще раз.",
      },
      {
        status: 503,
        headers: {
          "Retry-After": "2",
          "X-Request-Id": requestId,
        },
      }
    );
  }
}

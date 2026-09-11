import {
  type NovaPoshtaCityRecord,
  type NovaPoshtaWarehouseFilterType,
  type NovaPoshtaWarehouseRecord,
  toPublicNovaPoshtaCities,
  toPublicNovaPoshtaWarehouses,
} from "./nova-poshta.ts";
import {
  normalizeNovaPoshtaQuery,
  normalizeNovaPoshtaRef,
  normalizeNovaPoshtaWarehouseType,
  PublicApiValidationError,
} from "./public-api-validation.ts";

export const NOVA_POSHTA_UNAVAILABLE_MESSAGE =
  "Сервіс Нової пошти тимчасово недоступний. Спробуйте ще раз.";

type NovaPoshtaRouteClient = {
  getCities: (query: string, apiKey: string) => Promise<NovaPoshtaCityRecord[]>;
  getWarehouses: (
    cityRef: string,
    apiKey: string
  ) => Promise<NovaPoshtaWarehouseRecord[]>;
};

type HandlerOptions = {
  apiKey: string | null | undefined;
  client: NovaPoshtaRouteClient;
  requestId?: string;
  logFailure?: (context: string, requestId: string) => void;
};

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

function invalidResponse(error: PublicApiValidationError) {
  return json(
    { error: error.message },
    { status: error.status, headers: { "Cache-Control": "no-store" } }
  );
}

function unavailableResponse(requestId: string) {
  return json(
    { error: NOVA_POSHTA_UNAVAILABLE_MESSAGE },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "5",
        "X-Request-Id": requestId,
      },
    }
  );
}

function requestUrl(request: { url: string }) {
  return new URL(request.url);
}

export async function handleNovaPoshtaCitiesRequest(
  request: { url: string },
  options: HandlerOptions
) {
  const requestId = options.requestId ?? crypto.randomUUID();
  let query: string;

  try {
    query = normalizeNovaPoshtaQuery(
      requestUrl(request).searchParams.get("q")
    );
  } catch (error) {
    if (error instanceof PublicApiValidationError) {
      return invalidResponse(error);
    }

    options.logFailure?.("cities-validation", requestId);
    return unavailableResponse(requestId);
  }

  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    options.logFailure?.("cities-configuration", requestId);
    return unavailableResponse(requestId);
  }

  try {
    const records = await options.client.getCities(query, apiKey);

    return json(toPublicNovaPoshtaCities(records), {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    options.logFailure?.("cities-upstream", requestId);
    return unavailableResponse(requestId);
  }
}

export async function handleNovaPoshtaWarehousesRequest(
  request: { url: string },
  options: HandlerOptions
) {
  const requestId = options.requestId ?? crypto.randomUUID();
  let cityRef: string;
  let query: string;
  let type: NovaPoshtaWarehouseFilterType;

  try {
    const searchParams = requestUrl(request).searchParams;
    cityRef = normalizeNovaPoshtaRef(searchParams.get("cityRef"));
    query = normalizeNovaPoshtaQuery(searchParams.get("q"), {
      allowEmpty: true,
      allowSingleDigit: true,
    }).toLowerCase();
    type = normalizeNovaPoshtaWarehouseType(searchParams.get("type"));
  } catch (error) {
    if (error instanceof PublicApiValidationError) {
      return invalidResponse(error);
    }

    options.logFailure?.("warehouses-validation", requestId);
    return unavailableResponse(requestId);
  }

  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    options.logFailure?.("warehouses-configuration", requestId);
    return unavailableResponse(requestId);
  }

  try {
    const records = await options.client.getWarehouses(cityRef, apiKey);

    return json(toPublicNovaPoshtaWarehouses(records, type, query), {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
      },
    });
  } catch {
    options.logFailure?.("warehouses-upstream", requestId);
    return unavailableResponse(requestId);
  }
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const NOVA_POSHTA_API_URL = "https://api.novaposhta.ua/v2.0/json/";

type WarehouseFilterType = "branch" | "parcel_locker";

type NovaPoshtaWarehouseRecord = {
  Ref?: string;
  Description?: string;
  DescriptionRu?: string;
  ShortAddress?: string;
  ShortAddressRu?: string;
  TypeOfWarehouse?: string;
  CategoryOfWarehouse?: string;
  Number?: string;
  WarehouseIndex?: string;
  SettlementDescription?: string;
  PlaceMaxWeightAllowed?: string;
};

function isParcelLocker(record: NovaPoshtaWarehouseRecord) {
  const source = [
    record.Description,
    record.ShortAddress,
    record.TypeOfWarehouse,
    record.CategoryOfWarehouse,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return source.includes("поштомат") || source.includes("postomat");
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  const cityRef = request.nextUrl.searchParams.get("cityRef")?.trim() ?? "";
  const type = request.nextUrl.searchParams.get("type") as WarehouseFilterType | null;
  const rawQuery = request.nextUrl.searchParams.get("q") ?? "";
  const query = normalizeSearchValue(rawQuery);

  if (!cityRef) {
    return NextResponse.json([]);
  }

  if (type !== "branch" && type !== "parcel_locker") {
    return NextResponse.json(
      { error: "Invalid warehouse type." },
      { status: 400 }
    );
  }

  const apiKey = process.env.NOVA_POSHTA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Nova Poshta API key is not configured." },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(NOVA_POSHTA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey,
        modelName: "Address",
        calledMethod: "getWarehouses",
        methodProperties: {
          CityRef: cityRef,
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Nova Poshta API responded with ${response.status}`);
    }

    const payload = (await response.json()) as {
      success?: boolean;
      errors?: string[];
      data?: NovaPoshtaWarehouseRecord[];
    };

    if (!payload.success) {
      throw new Error(payload.errors?.[0] ?? "Failed to fetch warehouses.");
    }

    const warehouses = (payload.data ?? [])
      .filter((item) => item.Ref && (item.ShortAddress || item.Description))
      .filter((item) =>
        type === "parcel_locker" ? isParcelLocker(item) : !isParcelLocker(item)
      )
      .filter((item) => {
        if (!query) {
          return true;
        }

        const haystack = [
          item.Description,
          item.DescriptionRu,
          item.ShortAddress,
          item.ShortAddressRu,
          item.TypeOfWarehouse,
          item.CategoryOfWarehouse,
          item.Number,
          item.WarehouseIndex,
          item.SettlementDescription,
          item.PlaceMaxWeightAllowed,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
      .map((item) => ({
        ref: item.Ref as string,
        name: (item.Description ?? item.ShortAddress ?? "").trim(),
        address: (item.ShortAddress ?? item.Description ?? "").trim(),
        type: type === "parcel_locker" ? "parcel_locker" : "branch",
      }));

    return NextResponse.json(warehouses);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося завантажити список відділень.",
      },
      { status: 500 }
    );
  }
}

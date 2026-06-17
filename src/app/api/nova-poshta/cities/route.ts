import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const NOVA_POSHTA_API_URL = "https://api.novaposhta.ua/v2.0/json/";

type NovaPoshtaCityRecord = {
  Ref?: string;
  Description?: string;
  Present?: string;
  AreaDescription?: string;
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json([]);
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
        calledMethod: "getCities",
        methodProperties: {
          FindByString: query,
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
      data?: NovaPoshtaCityRecord[];
    };

    if (!payload.success) {
      throw new Error(payload.errors?.[0] ?? "Failed to fetch cities.");
    }

    const cities = (payload.data ?? [])
      .filter((item) => item.Ref && (item.Description || item.Present))
      .map((item) => ({
        ref: item.Ref as string,
        name: (item.Present ?? item.Description ?? "").trim(),
        area: item.AreaDescription?.trim() || null,
      }));

    return NextResponse.json(cities);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося завантажити список міст.",
      },
      { status: 500 }
    );
  }
}

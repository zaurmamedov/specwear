import type { NextRequest } from "next/server";
import { novaPoshtaClient } from "@/lib/nova-poshta";
import { handleNovaPoshtaWarehousesRequest } from "@/lib/nova-poshta-handlers";

export async function GET(request: NextRequest) {
  return handleNovaPoshtaWarehousesRequest(request, {
    apiKey: process.env.NOVA_POSHTA_API_KEY,
    client: novaPoshtaClient,
    logFailure: (context, requestId) => {
      console.error("Nova Poshta request failed", { context, requestId });
    },
  });
}

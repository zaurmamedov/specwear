import { NextResponse } from "next/server";

import { clearCustomerSessionCookies } from "@/lib/customer-auth";
import { validateSameOrigin } from "@/lib/security/request";

export async function POST(request: Request) {
  const invalidOrigin = validateSameOrigin(request);
  if (invalidOrigin) return invalidOrigin;

  const response = NextResponse.json({ success: true });
  clearCustomerSessionCookies(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

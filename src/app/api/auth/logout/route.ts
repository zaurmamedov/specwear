import { NextResponse } from "next/server";

import { clearCustomerSessionCookies } from "@/lib/customer-auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearCustomerSessionCookies(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

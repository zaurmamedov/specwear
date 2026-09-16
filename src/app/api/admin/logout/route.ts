import { NextResponse } from "next/server";

import { clearAdminSessionCookies } from "@/lib/admin-auth";
import { validateSameOrigin } from "@/lib/security/request";

export async function POST(request: Request) {
  const invalidOrigin = validateSameOrigin(request);
  if (invalidOrigin) return invalidOrigin;

  const response = NextResponse.json({ success: true });
  clearAdminSessionCookies(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

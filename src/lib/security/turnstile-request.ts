import { createHash } from "node:crypto";

function createVerificationIdempotencyKey(
  checkoutIdempotencyKey: string,
  token: string
) {
  const bytes = createHash("sha256")
    .update(`${checkoutIdempotencyKey}:${token}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getTurnstileRemoteIp(request: Request) {
  // No proxy trust boundary is configured yet. Turnstile's remoteip is optional,
  // so omitting it is safer than accepting caller-controlled forwarding headers.
  void request;
  return undefined;
}

export function createTurnstileVerificationBody(input: {
  secret: string;
  token: string;
  remoteIp?: string;
  idempotencyKey?: string;
}) {
  const body = new URLSearchParams({
    secret: input.secret,
    response: input.token,
  });

  if (input.remoteIp) {
    body.set("remoteip", input.remoteIp);
  }

  if (input.idempotencyKey) {
    body.set(
      "idempotency_key",
      createVerificationIdempotencyKey(input.idempotencyKey, input.token)
    );
  }

  return body;
}

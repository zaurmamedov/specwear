export type CheckoutIdempotencyResult<TResponse> =
  | { outcome: "missing" }
  | { outcome: "conflict" }
  | { outcome: "insufficient_stock" }
  | { outcome: "created"; response: TResponse }
  | { outcome: "reused"; response: TResponse };

export async function coordinateIdempotentCheckout<TPrepared, TResponse>(input: {
  lookup: () => Promise<CheckoutIdempotencyResult<TResponse>>;
  prepare: () => Promise<TPrepared>;
  commit: (
    prepared: TPrepared
  ) => Promise<CheckoutIdempotencyResult<TResponse>>;
  afterCreated: (prepared: TPrepared, response: TResponse) => Promise<void>;
}): Promise<CheckoutIdempotencyResult<TResponse>> {
  const existing = await input.lookup();

  if (existing.outcome !== "missing") {
    return existing;
  }

  const prepared = await input.prepare();
  const committed = await input.commit(prepared);

  if (committed.outcome === "created") {
    await input.afterCreated(prepared, committed.response);
  }

  return committed;
}

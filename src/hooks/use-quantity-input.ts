"use client";

import { useRef, useState } from "react";

import {
  getQuantityInputValue,
  parseCartQuantityDraft,
} from "@/lib/cart-quantity";
import type { CartQuantityMutationResult } from "@/stores/cart.store";

type UseQuantityInputOptions = {
  quantity: number;
  isPending?: boolean;
  message?: string | null;
  onCommit: (quantity: number) => Promise<CartQuantityMutationResult>;
  onClearMessage?: () => void;
};

export function useQuantityInput({
  quantity,
  isPending = false,
  message = null,
  onCommit,
  onClearMessage,
}: UseQuantityInputOptions) {
  const [draft, setDraft] = useState<string | null>(null);
  const [localPending, setLocalPending] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const requestId = useRef(0);
  const skipNextDraftCommit = useRef(false);
  const pending = isPending || localPending;

  const clearMessage = () => {
    setLocalMessage(null);
    onClearMessage?.();
  };

  const commitQuantity = async (desiredQuantity: number) => {
    if (pending || desiredQuantity === quantity) {
      setDraft(null);
      return desiredQuantity === quantity;
    }

    const currentRequestId = ++requestId.current;

    // End editing before validation so the committed quantity remains authoritative.
    setDraft(null);
    clearMessage();
    setLocalPending(true);

    const result = await onCommit(desiredQuantity);

    if (requestId.current !== currentRequestId) {
      return false;
    }

    setLocalPending(false);

    if (!result.ok) {
      setDraft(null);
      setLocalMessage(result.message);
      return false;
    }

    setDraft(null);
    setLocalMessage(null);
    return true;
  };

  const commitDraft = async () => {
    if (skipNextDraftCommit.current) {
      skipNextDraftCommit.current = false;
      return false;
    }

    const parsed = parseCartQuantityDraft(draft ?? String(quantity), quantity);

    if (!parsed.ok) {
      setDraft(null);
      setLocalMessage(parsed.message);
      return false;
    }

    return commitQuantity(parsed.quantity);
  };

  const reset = () => {
    requestId.current += 1;
    setDraft(null);
    setLocalPending(false);
    setLocalMessage(null);
    onClearMessage?.();
  };

  return {
    draft: getQuantityInputValue(draft, quantity),
    pending,
    message: localMessage ?? message,
    setDraft: (value: string) => {
      setDraft(value);
      clearMessage();
    },
    commitDraft,
    commitQuantity,
    reset,
    restore: () => {
      skipNextDraftCommit.current = true;
      setDraft(null);
      clearMessage();
    },
  };
}

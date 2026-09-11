import { handleCartAvailabilityRequest } from "@/lib/cart-availability-handler";
import { validateCartItems } from "@/services/cart-validation.service";

export async function POST(request: Request) {
  return handleCartAvailabilityRequest(request, validateCartItems, {
    logDependencyFailure: (requestId) => {
      console.error("Cart availability dependency failed", { requestId });
    },
  });
}

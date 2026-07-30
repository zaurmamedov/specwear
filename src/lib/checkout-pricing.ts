export const POSTGRES_INTEGER_MAX = 2_147_483_647;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CheckoutCustomerType = "retail" | "wholesale";

export type CheckoutPricingContext = {
  customerType: CheckoutCustomerType;
  isWholesaleApproved: boolean;
};

export type CheckoutProfilePricingData = {
  customer_type?: unknown;
  is_wholesale_approved?: unknown;
} | null;

export type CheckoutCartItem = {
  productId: string;
  variantId: string | null;
  quantity: number;
};

export type CheckoutCatalogVariant = {
  id: string;
  product_id: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  retail_price: number;
  old_price: number | null;
  wholesale_price: number | null;
  min_wholesale_quantity: number | null;
  stock_quantity: number;
  is_active: boolean;
};

export type CheckoutCatalogProduct = {
  id: string;
  name: string;
  slug: string;
  status: string | null;
  is_active: boolean;
  main_image_url: string | null;
  brand_name: string | null;
  category_name: string | null;
  product_images: Array<{
    image_url: string;
    sort_order: number;
    created_at: string;
  }>;
  product_variants: CheckoutCatalogVariant[];
};

export type PricedCheckoutItem = {
  productId: string;
  variantId: string;
  productName: string;
  productSlug: string;
  imageUrl: string | null;
  sku: string | null;
  size: string | null;
  color: string | null;
  brandName: string | null;
  categoryName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  stockQuantity: number;
};

export type AuthoritativeCheckoutPricing = {
  items: PricedCheckoutItem[];
  subtotal: number;
  deliveryPrice: number;
  discount: number;
  total: number;
};

export class CheckoutPricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutPricingError";
  }
}

export function getSafeCheckoutPricingContext(
  profile: CheckoutProfilePricingData
): CheckoutPricingContext {
  const isWholesaleApproved =
    profile?.customer_type === "wholesale" &&
    profile.is_wholesale_approved === true;

  return {
    customerType: isWholesaleApproved ? "wholesale" : "retail",
    isWholesaleApproved,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addSafeInteger(left: number, right: number, errorMessage: string) {
  const result = left + right;

  if (!Number.isSafeInteger(result) || result > POSTGRES_INTEGER_MAX) {
    throw new CheckoutPricingError(errorMessage);
  }

  return result;
}

function multiplySafeInteger(left: number, right: number, errorMessage: string) {
  const result = left * right;

  if (!Number.isSafeInteger(result) || result > POSTGRES_INTEGER_MAX) {
    throw new CheckoutPricingError(errorMessage);
  }

  return result;
}

export function parseCheckoutCartItems(value: unknown): CheckoutCartItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CheckoutPricingError("Кошик порожній.");
  }

  const mergedItems = new Map<string, CheckoutCartItem>();

  for (const rawItem of value) {
    if (!isRecord(rawItem)) {
      throw new CheckoutPricingError("Некоректні дані товару в кошику.");
    }

    const productId =
      typeof rawItem.productId === "string" ? rawItem.productId.trim() : "";
    const rawVariantId =
      typeof rawItem.variantId === "string" ? rawItem.variantId.trim() : "";
    const variantId = rawVariantId || null;
    const quantity = rawItem.quantity;

    if (!UUID_PATTERN.test(productId)) {
      throw new CheckoutPricingError("Некоректний ідентифікатор товару.");
    }

    if (variantId && !UUID_PATTERN.test(variantId)) {
      throw new CheckoutPricingError("Некоректний ідентифікатор варіанту товару.");
    }

    if (
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      throw new CheckoutPricingError(
        "Кількість товару має бути цілим числом, більшим за нуль."
      );
    }

    const key = `${productId}:${variantId ?? "default"}`;
    const existingItem = mergedItems.get(key);

    if (existingItem) {
      existingItem.quantity = addSafeInteger(
        existingItem.quantity,
        quantity,
        "Загальна кількість товару перевищує допустиме значення."
      );
      continue;
    }

    mergedItems.set(key, {
      productId,
      variantId,
      quantity,
    });
  }

  return Array.from(mergedItems.values());
}

function getPrimaryImageUrl(product: CheckoutCatalogProduct) {
  const firstImage = [...product.product_images].sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }

    return left.created_at.localeCompare(right.created_at);
  })[0]?.image_url;

  return firstImage ?? product.main_image_url ?? null;
}

function getCanonicalUnitPrice(
  variant: CheckoutCatalogVariant,
  context: CheckoutPricingContext
) {
  // Wholesale checkout rules are not complete yet (including minimum quantities).
  // Preserve the existing safe behavior and use the canonical retail price for all orders.
  void context;
  return variant.retail_price;
}

function resolveVariant(
  item: CheckoutCartItem,
  product: CheckoutCatalogProduct,
  requestedVariantsById: Map<string, CheckoutCatalogVariant>
) {
  if (item.variantId) {
    const requestedVariant = requestedVariantsById.get(item.variantId);

    if (!requestedVariant) {
      throw new CheckoutPricingError("Обраний варіант товару більше не існує.");
    }

    if (requestedVariant.product_id !== product.id) {
      throw new CheckoutPricingError(
        "Обраний варіант не належить вказаному товару."
      );
    }

    return requestedVariant;
  }

  const activeVariants = product.product_variants.filter(
    (variant) => variant.is_active
  );

  if (activeVariants.length === 0) {
    throw new CheckoutPricingError(
      `Для товару «${product.name}» немає доступного варіанту.`
    );
  }

  if (activeVariants.length > 1) {
    throw new CheckoutPricingError(`Оберіть варіант товару «${product.name}».`);
  }

  return activeVariants[0];
}

export function calculateAuthoritativeCheckoutPricing(input: {
  items: CheckoutCartItem[];
  products: CheckoutCatalogProduct[];
  requestedVariants: CheckoutCatalogVariant[];
  pricingContext: CheckoutPricingContext;
  deliveryPrice?: number;
  discount?: number;
}): AuthoritativeCheckoutPricing {
  const productsById = new Map(input.products.map((product) => [product.id, product]));
  const requestedVariantsById = new Map(
    input.requestedVariants.map((variant) => [variant.id, variant])
  );
  const resolvedItems = new Map<
    string,
    {
      product: CheckoutCatalogProduct;
      variant: CheckoutCatalogVariant;
      quantity: number;
    }
  >();

  for (const item of input.items) {
    const product = productsById.get(item.productId);

    if (!product) {
      throw new CheckoutPricingError("Один із товарів більше не існує.");
    }

    if (!product.is_active || product.status === "archived") {
      throw new CheckoutPricingError(
        `Товар «${product.name}» більше недоступний для замовлення.`
      );
    }

    if (product.status !== "active") {
      throw new CheckoutPricingError(
        `Товар «${product.name}» тимчасово недоступний для замовлення.`
      );
    }

    const variant = resolveVariant(item, product, requestedVariantsById);

    if (!variant.is_active) {
      throw new CheckoutPricingError(
        `Обраний варіант товару «${product.name}» більше недоступний.`
      );
    }

    const resolvedKey = `${product.id}:${variant.id}`;
    const existingItem = resolvedItems.get(resolvedKey);
    const quantity = existingItem
      ? addSafeInteger(
          existingItem.quantity,
          item.quantity,
          "Загальна кількість товару перевищує допустиме значення."
        )
      : item.quantity;

    resolvedItems.set(resolvedKey, {
      product,
      variant,
      quantity,
    });
  }

  const deliveryPrice = input.deliveryPrice ?? 0;
  const discount = input.discount ?? 0;

  if (
    !Number.isSafeInteger(deliveryPrice) ||
    deliveryPrice < 0 ||
    deliveryPrice > POSTGRES_INTEGER_MAX ||
    !Number.isSafeInteger(discount) ||
    discount < 0 ||
    discount > POSTGRES_INTEGER_MAX
  ) {
    throw new CheckoutPricingError("Не вдалося розрахувати суму замовлення.");
  }

  let subtotal = 0;
  const pricedItems: PricedCheckoutItem[] = [];

  for (const resolved of resolvedItems.values()) {
    const { product, variant, quantity } = resolved;

    if (
      !Number.isSafeInteger(variant.stock_quantity) ||
      variant.stock_quantity < 0 ||
      quantity > variant.stock_quantity
    ) {
      throw new CheckoutPricingError(
        `Недостатньо товару «${product.name}» у вибраній кількості.`
      );
    }

    const unitPrice = getCanonicalUnitPrice(variant, input.pricingContext);

    if (
      !Number.isSafeInteger(unitPrice) ||
      unitPrice < 0 ||
      unitPrice > POSTGRES_INTEGER_MAX
    ) {
      throw new CheckoutPricingError(
        `Не вдалося визначити актуальну ціну товару «${product.name}».`
      );
    }

    const lineTotal = multiplySafeInteger(
      unitPrice,
      quantity,
      "Сума позиції перевищує допустиме значення."
    );
    subtotal = addSafeInteger(
      subtotal,
      lineTotal,
      "Сума замовлення перевищує допустиме значення."
    );

    pricedItems.push({
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      productSlug: product.slug,
      imageUrl: getPrimaryImageUrl(product),
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      brandName: product.brand_name,
      categoryName: product.category_name,
      quantity,
      unitPrice,
      lineTotal,
      stockQuantity: variant.stock_quantity,
    });
  }

  const beforeDiscount = addSafeInteger(
    subtotal,
    deliveryPrice,
    "Сума замовлення перевищує допустиме значення."
  );

  if (discount > beforeDiscount) {
    throw new CheckoutPricingError("Знижка перевищує суму замовлення.");
  }

  return {
    items: pricedItems,
    subtotal,
    deliveryPrice,
    discount,
    total: beforeDiscount - discount,
  };
}

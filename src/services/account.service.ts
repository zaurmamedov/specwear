import "server-only";

import type { User } from "@supabase/supabase-js";

import {
  createServerSupabaseCustomerDataClient,
  createServerSupabaseCustomerDataClientFromCookies,
} from "@/lib/customer-auth";
import { normalizeProductStatus } from "@/lib/product-status";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import type { OrderWithItems } from "@/types/order";
import type { Profile } from "@/types/profile";
import type { ProductStoreItem } from "@/types/store";

type UpsertProfileInput = {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  delivery_service?: string | null;
  delivery_method?: string | null;
  delivery_city?: string | null;
  delivery_city_ref?: string | null;
  delivery_warehouse?: string | null;
  delivery_warehouse_ref?: string | null;
  delivery_address?: string | null;
};

type RepeatableOrderResult = {
  items: Array<ProductStoreItem & { quantity: number }>;
  unavailableItems: string[];
};

function normalizeOrders(data: OrderWithItems[] | null | undefined) {
  return (data ?? []).map((order) => ({
    ...order,
    order_items: [...(order.order_items ?? [])].sort((left, right) =>
      left.created_at.localeCompare(right.created_at)
    ),
  }));
}

async function enrichOrdersWithCurrentCatalogData(orders: OrderWithItems[]) {
  const supabase = createServerSupabaseAdminClient();
  const variantIds = Array.from(
    new Set(
      orders.flatMap((order) =>
        order.order_items.map((item) => item.variant_id).filter((value): value is string => Boolean(value))
      )
    )
  );
  const productIds = Array.from(
    new Set(
      orders.flatMap((order) =>
        order.order_items.map((item) => item.product_id).filter((value): value is string => Boolean(value))
      )
    )
  );

  const [variantsResult, productsResult] = await Promise.all([
    variantIds.length > 0
      ? supabase
          .from("product_variants")
          .select("id, sku, size, color")
          .in("id", variantIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length > 0
      ? supabase
          .from("products")
          .select(`
            id,
            slug,
            brand:brands(name),
            category:categories(name),
            product_images(image_url, sort_order, created_at)
          `)
          .in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (variantsResult.error) {
    throw new Error(`Failed to fetch product variants: ${variantsResult.error.message}`);
  }

  if (productsResult.error) {
    throw new Error(`Failed to fetch products for orders: ${productsResult.error.message}`);
  }

  const variantsMap = new Map(
    ((variantsResult.data ?? []) as Array<{
      id: string;
      sku: string | null;
      size: string | null;
      color: string | null;
    }>).map((variant) => [variant.id, variant])
  );

  const productsMap = new Map(
    ((productsResult.data ?? []) as unknown as Array<{
      id: string;
      slug: string | null;
      brand: { name: string | null }[] | { name: string | null } | null;
      category: { name: string | null }[] | { name: string | null } | null;
      product_images: Array<{ image_url: string; sort_order: number; created_at: string }>;
    }>).map((product) => [
      product.id,
      {
        ...product,
        brand: unwrapRelation(product.brand),
        category: unwrapRelation(product.category),
      },
    ])
  );

  return orders.map((order) => ({
    ...order,
    order_items: order.order_items.map((item) => {
      const variant = item.variant_id ? variantsMap.get(item.variant_id) : null;
      const product = item.product_id ? productsMap.get(item.product_id) : null;

      return {
        ...item,
        product_slug: item.product_slug ?? product?.slug ?? null,
        image_url: item.image_url ?? getPrimaryImageUrl(product?.product_images ?? []),
        sku: item.sku ?? variant?.sku ?? null,
        size: item.size ?? variant?.size ?? null,
        color: item.color ?? variant?.color ?? null,
        brand_name: item.brand_name ?? product?.brand?.name ?? null,
        category_name: item.category_name ?? product?.category?.name ?? null,
      };
    }),
  }));
}

function getPrimaryImageUrl(
  images: Array<{ image_url: string; sort_order: number; created_at: string }>
) {
  return [...images]
    .sort((left, right) => {
      if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order;
      }

      return left.created_at.localeCompare(right.created_at);
    })[0]?.image_url ?? null;
}

function unwrapRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export async function getProfileByUserId(userId: string) {
  const supabase = await createServerSupabaseCustomerDataClientFromCookies();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (error.message.toLowerCase().includes("permission denied")) {
      return null;
    }

    throw new Error(`Failed to fetch profile: ${error.message}`);
  }

  return (data as Profile | null) ?? null;
}

export async function getOrCreateProfileForUser(
  user: Pick<User, "id" | "email">,
  accessToken?: string | null
) {
  const existingProfile = await getProfileByUserId(user.id);

  if (existingProfile) {
    return existingProfile;
  }

  await upsertProfileForUser(
    user,
    {
      email: user.email ?? null,
    },
    accessToken
  );

  return getProfileByUserId(user.id);
}

export async function upsertProfileForUser(
  user: Pick<User, "id" | "email">,
  input: UpsertProfileInput,
  accessToken?: string | null
) {
  const supabase =
    accessToken && accessToken.trim() !== ""
      ? createServerSupabaseCustomerDataClient(accessToken)
      : await createServerSupabaseCustomerDataClientFromCookies();

  if (!supabase) {
    throw new Error("Failed to save profile: customer session is missing.");
  }

  const customerEditablePayload = {
    email: input.email ?? user.email ?? null,
    first_name: input.first_name ?? null,
    last_name: input.last_name ?? null,
    phone: input.phone ?? null,
    delivery_service: input.delivery_service ?? null,
    delivery_method: input.delivery_method ?? null,
    delivery_city: input.delivery_city ?? null,
    delivery_city_ref: input.delivery_city_ref ?? null,
    delivery_warehouse: input.delivery_warehouse ?? null,
    delivery_warehouse_ref: input.delivery_warehouse_ref ?? null,
    delivery_address: input.delivery_address ?? null,
  };

  const { data: existingProfile, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError && !selectError.message.toLowerCase().includes("permission denied")) {
    throw new Error(`Failed to save profile: ${selectError.message}`);
  }

  if (existingProfile?.id) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update(customerEditablePayload)
      .eq("id", user.id);

    if (updateError) {
      throw new Error(`Failed to save profile: ${updateError.message}`);
    }

    return;
  }

  const { error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      ...customerEditablePayload,
    });

  if (insertError) {
    throw new Error(`Failed to save profile: ${insertError.message}`);
  }
}

export async function getOrdersForUser(userId: string) {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch account orders: ${error.message}`);
  }

  return enrichOrdersWithCurrentCatalogData(
    normalizeOrders((data ?? []) as OrderWithItems[])
  );
}

export async function getOrderForUser(userId: string, orderId: string) {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch order: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const [enrichedOrder] = await enrichOrdersWithCurrentCatalogData(
    normalizeOrders([data as OrderWithItems])
  );

  return enrichedOrder ?? null;
}

export async function buildRepeatOrderItems(
  userId: string,
  orderId: string
): Promise<RepeatableOrderResult> {
  const order = await getOrderForUser(userId, orderId);

  if (!order) {
    throw new Error("Order not found.");
  }

  const supabase = createServerSupabaseAdminClient();
  const productIds = Array.from(
    new Set(order.order_items.map((item) => item.product_id).filter((value): value is string => Boolean(value)))
  );

  if (productIds.length === 0) {
    return {
      items: [],
      unavailableItems: order.order_items.map((item) => item.product_name),
    };
  }

  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      slug,
      name,
      status,
      is_active,
      brand:brands(name),
      category:categories(name),
      product_images(id, image_url, sort_order, created_at),
      product_variants(id, sku, size, color, retail_price, old_price, stock_quantity, is_active)
    `)
    .in("id", productIds);

  if (error) {
    throw new Error(`Failed to load products for repeat order: ${error.message}`);
  }

  const products = new Map(
    ((data ?? []) as unknown as Array<{
      id: string;
      slug: string;
      name: string;
      status: string | null;
      is_active: boolean;
      brand: { name: string | null }[] | { name: string | null } | null;
      category: { name: string | null }[] | { name: string | null } | null;
      product_images: Array<{ image_url: string; sort_order: number; created_at: string }>;
      product_variants: Array<{
        id: string;
        sku: string | null;
        size: string | null;
        color: string | null;
        retail_price: number | null;
        old_price: number | null;
        stock_quantity: number;
        is_active: boolean;
      }>;
    }>).map((product) => [
      product.id,
      {
        ...product,
        brand: unwrapRelation(product.brand),
        category: unwrapRelation(product.category),
      },
    ])
  );

  const items: Array<ProductStoreItem & { quantity: number }> = [];
  const unavailableItems: string[] = [];

  for (const orderItem of order.order_items) {
    const product = orderItem.product_id ? products.get(orderItem.product_id) : null;

    if (
      !product ||
      !product.is_active ||
      normalizeProductStatus(product.status) !== "active"
    ) {
      unavailableItems.push(orderItem.product_name);
      continue;
    }

    const activePurchasableVariants = product.product_variants.filter(
      (variant) =>
        variant.is_active &&
        variant.retail_price !== null &&
        variant.stock_quantity > 0
    );

    let matchedVariant =
      activePurchasableVariants.find((variant) => variant.id === orderItem.variant_id) ?? null;

    if (!matchedVariant && !orderItem.variant_id && activePurchasableVariants.length === 1) {
      matchedVariant = activePurchasableVariants[0] ?? null;
    }

    if (!matchedVariant) {
      unavailableItems.push(orderItem.product_name);
      continue;
    }

    items.push({
      productId: product.id,
      variantId: matchedVariant.id,
      slug: product.slug,
      name: product.name,
      imageUrl: getPrimaryImageUrl(product.product_images ?? []),
      price: matchedVariant.retail_price,
      oldPrice: matchedVariant.old_price ?? null,
      sku: matchedVariant.sku ?? null,
      size: matchedVariant.size ?? null,
      color: matchedVariant.color ?? null,
      categoryName: product.category?.name ?? null,
      brandName: product.brand?.name ?? null,
      stockQuantity: matchedVariant.stock_quantity,
      quantity: Math.min(orderItem.quantity, matchedVariant.stock_quantity),
    });
  }

  return {
    items,
    unavailableItems,
  };
}

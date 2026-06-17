import "server-only";

import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import type { Order, OrderStatus, OrdersListFilters, OrderWithItems } from "@/types/order";

function matchesSearch(order: Order, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    order.id,
    order.id.slice(0, 8),
    order.phone,
    order.first_name,
    order.last_name,
    `${order.first_name} ${order.last_name}`,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export async function getOrders(filters: OrdersListFilters = {}): Promise<Order[]> {
  const supabase = createServerSupabaseAdminClient();
  let query = supabase.from("orders").select("*").order("created_at", { ascending: false });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }

  const orders = (data ?? []) as Order[];

  if (!filters.q?.trim()) {
    return orders;
  }

  return orders.filter((order) => matchesSearch(order, filters.q as string));
}

export async function getOrderById(id: string): Promise<OrderWithItems | null> {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch order: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    ...(data as Order),
    order_items: ((data as { order_items?: OrderWithItems["order_items"] }).order_items ?? [])
      .slice()
      .sort((left, right) => left.created_at.localeCompare(right.created_at)),
  };
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  const supabase = createServerSupabaseAdminClient();
  const { error } = await supabase.from("orders").update({ status }).eq("id", id);

  if (error) {
    throw new Error(`Failed to update order status: ${error.message}`);
  }
}

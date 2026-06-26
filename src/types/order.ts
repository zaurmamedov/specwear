export type OrderStatus =
  | "new"
  | "processing"
  | "shipped"
  | "completed"
  | "cancelled";

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  product_slug: string | null;
  image_url: string | null;
  sku: string | null;
  size: string | null;
  color: string | null;
  brand_name: string | null;
  category_name: string | null;
  price: number;
  quantity: number;
  total: number;
  created_at: string;
}

export interface Order {
  id: string;
  user_id?: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  customer_type: "retail" | "wholesale";
  delivery_service: string;
  delivery_method: string;
  delivery_city: string;
  delivery_city_ref: string | null;
  delivery_warehouse: string | null;
  delivery_warehouse_ref: string | null;
  delivery_address: string | null;
  comment: string | null;
  subtotal: number;
  delivery_price: number;
  total: number;
  status: OrderStatus;
  created_at: string;
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[];
}

export type OrdersListFilters = {
  q?: string | null;
  status?: OrderStatus | null;
};

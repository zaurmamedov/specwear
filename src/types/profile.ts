export interface Profile {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  delivery_service: string | null;
  delivery_method: string | null;
  delivery_city: string | null;
  delivery_city_ref: string | null;
  delivery_warehouse: string | null;
  delivery_warehouse_ref: string | null;
  delivery_address: string | null;
  customer_type: "retail" | "wholesale";
  is_wholesale_approved: boolean;
  created_at: string;
  updated_at: string;
}

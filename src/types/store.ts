export interface ProductStoreItem {
  productId: string;
  variantId?: string | null;
  slug: string;
  name: string;
  imageUrl: string | null;
  price: number | null;
  oldPrice?: number | null;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  categoryName?: string | null;
  brandName?: string | null;
}

export interface CartItem extends ProductStoreItem {
  quantity: number;
}

export type WishlistItem = ProductStoreItem;

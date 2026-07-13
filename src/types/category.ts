export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  parentId: string | null;
  icon_name: string | null;
  iconName: string | null;
  image_url: string | null;
  imageUrl: string | null;
  sort_order: number;
  sortOrder: number;
  is_active: boolean;
  isActive: boolean;
  created_at: string;
  children?: Category[];
}

export type CategoryTreeNode = Category & {
  children: CategoryTreeNode[];
};

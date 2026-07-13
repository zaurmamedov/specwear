import type { Category, CategoryTreeNode } from "@/types/category";

export type CategoryOption = {
  category: Category;
  depth: number;
  label: string;
  pathLabel: string;
};

function getParentId(category: Category) {
  return category.parent_id ?? category.parentId ?? null;
}

function getSortOrder(category: Category) {
  return category.sort_order ?? category.sortOrder ?? 0;
}

function isCategoryActive(category: Category) {
  return category.is_active ?? category.isActive ?? true;
}

function sortCategories(left: Category, right: Category) {
  const sortOrderDiff = getSortOrder(left) - getSortOrder(right);

  if (sortOrderDiff !== 0) {
    return sortOrderDiff;
  }

  return left.name.localeCompare(right.name, "uk", { sensitivity: "base" });
}

function cloneCategory(category: Category): CategoryTreeNode {
  return {
    ...category,
    parent_id: getParentId(category),
    parentId: getParentId(category),
    icon_name: category.icon_name ?? category.iconName ?? null,
    iconName: category.icon_name ?? category.iconName ?? null,
    image_url: category.image_url ?? category.imageUrl ?? null,
    imageUrl: category.image_url ?? category.imageUrl ?? null,
    sort_order: getSortOrder(category),
    sortOrder: getSortOrder(category),
    is_active: isCategoryActive(category),
    isActive: isCategoryActive(category),
    children: [],
  };
}

export function normalizeCategory(category: Category): Category {
  const parentId = getParentId(category);
  const iconName = category.icon_name ?? category.iconName ?? null;
  const imageUrl = category.image_url ?? category.imageUrl ?? null;
  const sortOrder = getSortOrder(category);
  const isActive = isCategoryActive(category);

  return {
    ...category,
    parent_id: parentId,
    parentId,
    icon_name: iconName,
    iconName,
    image_url: imageUrl,
    imageUrl,
    sort_order: sortOrder,
    sortOrder,
    is_active: isActive,
    isActive,
    children: category.children ?? [],
  };
}

export function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const nodes = categories.map((category) => cloneCategory(normalizeCategory(category)));
  const byId = new Map(nodes.map((category) => [category.id, category]));
  const roots: CategoryTreeNode[] = [];

  nodes.forEach((category) => {
    const parentId = getParentId(category);

    if (parentId) {
      const parent = byId.get(parentId);

      if (parent) {
        parent.children.push(category);
        return;
      }
    }

    roots.push(category);
  });

  function sortTree(items: CategoryTreeNode[]): CategoryTreeNode[] {
    return [...items]
      .sort(sortCategories)
      .map((item) => ({
        ...item,
        children: sortTree(item.children),
      }));
  }

  return sortTree(roots);
}

export function flattenCategoryTree(categories: Category[]): Category[] {
  const flat: Category[] = [];
  const tree = Array.isArray(categories) ? buildCategoryTree(categories) : [];

  function visit(items: CategoryTreeNode[]) {
    items.forEach((item) => {
      flat.push(item);
      visit(item.children);
    });
  }

  visit(tree);
  return flat;
}

export function buildCategoryOptions(categories: Category[]): CategoryOption[] {
  const options: CategoryOption[] = [];
  const tree = buildCategoryTree(categories);

  function visit(items: CategoryTreeNode[], depth: number, parents: string[]) {
    items.forEach((item) => {
      const path = [...parents, item.name];
      options.push({
        category: item,
        depth,
        label: `${depth > 0 ? `${"— ".repeat(depth)}` : ""}${item.name}`,
        pathLabel: path.join(" / "),
      });
      visit(item.children, depth + 1, path);
    });
  }

  visit(tree, 0, []);
  return options;
}

export function findCategoryBySlug(categories: Category[], slug: string) {
  return flattenCategoryTree(categories).find((category) => category.slug === slug) ?? null;
}

export function getCategoryDescendantIds(categories: Category[], categoryId: string) {
  const tree = buildCategoryTree(categories);
  const ids: string[] = [];

  function visit(items: CategoryTreeNode[]) {
    for (const item of items) {
      if (item.id === categoryId) {
        collect(item);
        return true;
      }

      if (visit(item.children)) {
        return true;
      }
    }

    return false;
  }

  function collect(node: CategoryTreeNode) {
    ids.push(node.id);
    node.children.forEach(collect);
  }

  visit(tree);
  return ids;
}

export function getCategoryPath(categories: Category[], categoryId: string) {
  const byId = new Map(
    flattenCategoryTree(categories).map((category) => [category.id, normalizeCategory(category)])
  );
  const path: Category[] = [];
  let current = byId.get(categoryId) ?? null;

  while (current) {
    path.unshift(current);
    const parentId = getParentId(current);
    current = parentId ? byId.get(parentId) ?? null : null;
  }

  return path;
}

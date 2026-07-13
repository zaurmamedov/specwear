"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { buildCategoryTree } from "@/lib/categories";
import type {
  AvailabilityFilter,
  ProductFilterPreviewItem,
} from "@/services/products.service";
import type { Category, CategoryTreeNode } from "@/types/category";

import styles from "./FiltersSidebar.module.css";

type CatalogFilters = {
  category: string | null;
  brand: string[];
  size: string[];
  color: string[];
  availability: AvailabilityFilter[];
  q?: string | null;
  sort?: string | null;
};

type FiltersSidebarProps = {
  categories: Category[];
  filterPreviewData: ProductFilterPreviewItem[];
  selectedFilters: CatalogFilters;
};

type FilterGroupKey = "category" | "brand" | "size" | "color" | "availability";

function normalizeUnique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildSearchParams(filters: CatalogFilters) {
  const params = new URLSearchParams();

  if (filters.category) {
    params.set("category", filters.category);
  }

  normalizeUnique(filters.brand).forEach((value) => params.append("brand", value));
  normalizeUnique(filters.size).forEach((value) => params.append("size", value));
  normalizeUnique(filters.color).forEach((value) => params.append("color", value));
  normalizeUnique(filters.availability).forEach((value) =>
    params.append("availability", value)
  );

  if (filters.q) {
    params.set("q", filters.q);
  }

  if (filters.sort && filters.sort !== "default") {
    params.set("sort", filters.sort);
  }

  return params;
}

function getAvailableOptions(
  filterPreviewData: ProductFilterPreviewItem[],
  filters: CatalogFilters
) {
  function matchesDraft(
    item: ProductFilterPreviewItem,
    nextFilters: CatalogFilters,
    omitGroup?: FilterGroupKey
  ) {
    if (
      omitGroup !== "category" &&
      nextFilters.category &&
      !item.categorySlugs.includes(nextFilters.category)
    ) {
      return false;
    }

    if (
      omitGroup !== "brand" &&
      nextFilters.brand.length > 0 &&
      (!item.brandSlug || !nextFilters.brand.includes(item.brandSlug))
    ) {
      return false;
    }

    if (
      omitGroup !== "size" &&
      nextFilters.size.length > 0 &&
      !nextFilters.size.some((size) => item.sizes.includes(size))
    ) {
      return false;
    }

    if (
      omitGroup !== "color" &&
      nextFilters.color.length > 0 &&
      !nextFilters.color.some((color) => item.colors.includes(color))
    ) {
      return false;
    }

    if (omitGroup !== "availability" && nextFilters.availability.length === 1) {
      if (nextFilters.availability[0] === "in_stock" && !item.inStock) {
        return false;
      }

      if (nextFilters.availability[0] === "out_of_stock" && item.inStock) {
        return false;
      }
    }

    return true;
  }

  function computeForGroup(omitGroup?: FilterGroupKey) {
    return filterPreviewData.filter((item) => matchesDraft(item, filters, omitGroup));
  }

  const brandItems = computeForGroup("brand");
  const sizeItems = computeForGroup("size");
  const colorItems = computeForGroup("color");
  const availabilityItems = computeForGroup("availability");

  const brands = Array.from(
    new Map(
      brandItems
        .filter((item) => item.brandSlug && item.brandName)
        .map((item) => [
          item.brandSlug!,
          { slug: item.brandSlug!, name: item.brandName! },
        ])
    ).values()
  ).sort((left, right) =>
    left.name.localeCompare(right.name, "uk", { sensitivity: "base" })
  );

  const sizes = Array.from(new Set(sizeItems.flatMap((item) => item.sizes))).sort(
    (left, right) =>
      left.localeCompare(right, "uk", { numeric: true, sensitivity: "base" })
  );

  const colors = Array.from(new Set(colorItems.flatMap((item) => item.colors))).sort(
    (left, right) =>
      left.localeCompare(right, "uk", { numeric: true, sensitivity: "base" })
  );

  const availability: AvailabilityFilter[] = [];
  if (availabilityItems.some((item) => item.inStock)) {
    availability.push("in_stock");
  }
  if (availabilityItems.some((item) => !item.inStock)) {
    availability.push("out_of_stock");
  }

  return {
    brands,
    sizes,
    colors,
    availability,
  };
}

export function FiltersSidebar({
  categories,
  filterPreviewData,
  selectedFilters,
}: FiltersSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [brandSearch, setBrandSearch] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<FilterGroupKey, boolean>>({
    category: true,
    brand: false,
    size: false,
    color: false,
    availability: false,
  });
  const [draftFilters, setDraftFilters] = useState<CatalogFilters>(selectedFilters);
  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isDrawerOpen]);

  const availableOptions = useMemo(
    () => getAvailableOptions(filterPreviewData, draftFilters),
    [draftFilters, filterPreviewData]
  );
  const availableCategorySlugs = useMemo(() => {
    function matchesWithoutCategory(item: ProductFilterPreviewItem) {
      if (
        draftFilters.brand.length > 0 &&
        (!item.brandSlug || !draftFilters.brand.includes(item.brandSlug))
      ) {
        return false;
      }

      if (
        draftFilters.size.length > 0 &&
        !draftFilters.size.some((size) => item.sizes.includes(size))
      ) {
        return false;
      }

      if (
        draftFilters.color.length > 0 &&
        !draftFilters.color.some((color) => item.colors.includes(color))
      ) {
        return false;
      }

      if (draftFilters.availability.length === 1) {
        if (draftFilters.availability[0] === "in_stock" && !item.inStock) {
          return false;
        }

        if (draftFilters.availability[0] === "out_of_stock" && item.inStock) {
          return false;
        }
      }

      return true;
    }

    return new Set(
      filterPreviewData
        .filter((item) => matchesWithoutCategory(item))
        .flatMap((item) => item.categorySlugs)
    );
  }, [
    draftFilters.availability,
    draftFilters.brand,
    draftFilters.color,
    draftFilters.size,
    filterPreviewData,
  ]);

  const filteredBrands = useMemo(() => {
    const query = brandSearch.trim().toLowerCase();

    if (!query) {
      return availableOptions.brands;
    }

    return availableOptions.brands.filter((brand) =>
      brand.name.toLowerCase().includes(query)
    );
  }, [availableOptions.brands, brandSearch]);

  function sanitizeDraftFilters(filters: CatalogFilters): CatalogFilters {
    const nextOptions = getAvailableOptions(filterPreviewData, filters);
    const nextVisibleCategorySlugs = new Set(
      filterPreviewData
        .filter((item) => {
          if (
            filters.brand.length > 0 &&
            (!item.brandSlug || !filters.brand.includes(item.brandSlug))
          ) {
            return false;
          }

          if (filters.size.length > 0 && !filters.size.some((size) => item.sizes.includes(size))) {
            return false;
          }

          if (
            filters.color.length > 0 &&
            !filters.color.some((color) => item.colors.includes(color))
          ) {
            return false;
          }

          if (filters.availability.length === 1) {
            if (filters.availability[0] === "in_stock" && !item.inStock) {
              return false;
            }

            if (filters.availability[0] === "out_of_stock" && item.inStock) {
              return false;
            }
          }

          return true;
        })
        .flatMap((item) => item.categorySlugs)
    );

    return {
      ...filters,
      category:
        filters.category && !nextVisibleCategorySlugs.has(filters.category)
          ? null
          : filters.category,
      brand: filters.brand.filter((value) =>
        nextOptions.brands.some((brand) => brand.slug === value)
      ),
      size: filters.size.filter((value) => nextOptions.sizes.includes(value)),
      color: filters.color.filter((value) => nextOptions.colors.includes(value)),
      availability: filters.availability.filter((value) =>
        nextOptions.availability.includes(value)
      ),
    };
  }

  function toggleGroup(group: FilterGroupKey) {
    setOpenGroups((current) => ({
      ...current,
      [group]: !current[group],
    }));
  }

  function updateCategory(value: string | null) {
    setDraftFilters((current) =>
      sanitizeDraftFilters({
        ...current,
        category: current.category === value ? null : value,
      })
    );
  }

  function toggleMultiValue(
    key: "brand" | "size" | "color" | "availability",
    value: string
  ) {
    setDraftFilters((current) => {
      const currentValues = current[key];
      const hasValue = currentValues.includes(value as never);

      return sanitizeDraftFilters({
        ...current,
        [key]: hasValue
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value],
      });
    });
  }

  function applyFilters(nextFilters = draftFilters) {
    const params = buildSearchParams(sanitizeDraftFilters(nextFilters));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
    setIsDrawerOpen(false);
  }

  function resetAll() {
    setDraftFilters({
      category: null,
      brand: [],
      size: [],
      color: [],
      availability: [],
      q: null,
      sort: "default",
    });
    setBrandSearch("");
    setIsDrawerOpen(false);
    router.push("/catalog");
  }

  const brandCount = availableOptions.brands.length;
  const sizeCount = availableOptions.sizes.length;
  const colorCount = availableOptions.colors.length;
  const availabilityCount = availableOptions.availability.length;

  function renderCategoryBranch(items: CategoryTreeNode[], depth = 0): React.ReactNode {
    return items
      .filter((category) => availableCategorySlugs.has(category.slug))
      .map((category) => {
        const isActive = draftFilters.category === category.slug;

        return (
          <div key={category.id} className={styles.categoryNode}>
            <button
              type="button"
              className={`${styles.optionButton} ${styles.categoryButton} ${
                isActive ? styles.optionButtonActive : ""
              }`}
              onClick={() => updateCategory(category.slug)}
              style={{ paddingInlineStart: `${0.85 + depth * 1.1}rem` }}
            >
              <span className={styles.categoryButtonInner}>
                {depth > 0 ? <span className={styles.categoryDash}>—</span> : null}
                <span>{category.name}</span>
              </span>
            </button>

            {category.children.length > 0 ? (
              <div className={styles.categoryChildren}>
                {renderCategoryBranch(category.children, depth + 1)}
              </div>
            ) : null}
          </div>
        );
      });
  }

  const renderedPanel = (
    <div className={styles.panel}>
      <section className={styles.group}>
        <button
          type="button"
          className={styles.groupToggle}
          onClick={() => toggleGroup("category")}
          aria-expanded={openGroups.category}
        >
          <span>Категорії</span>
          <span className={styles.groupChevron}>{openGroups.category ? "−" : "+"}</span>
        </button>

        {openGroups.category ? (
          <div className={styles.groupBody}>
            <div className={styles.categoryTree}>{renderCategoryBranch(categoryTree)}</div>

            {draftFilters.category ? (
              <button
                type="button"
                className={styles.clearGroupButton}
                onClick={() => updateCategory(null)}
              >
                Очистити категорію
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {brandCount > 0 ? (
        <section className={styles.group}>
          <button
            type="button"
            className={styles.groupToggle}
            onClick={() => toggleGroup("brand")}
            aria-expanded={openGroups.brand}
          >
            <span>Бренди ({brandCount})</span>
            <span className={styles.groupChevron}>{openGroups.brand ? "−" : "+"}</span>
          </button>

          {openGroups.brand ? (
            <div className={styles.groupBody}>
              <label className={styles.searchField}>
                <span className={styles.visuallyHidden}>Пошук бренду</span>
                <input
                  type="search"
                  value={brandSearch}
                  onChange={(event) => setBrandSearch(event.target.value)}
                  placeholder="Пошук бренду..."
                />
              </label>

              {filteredBrands.length > 0 ? (
                <div className={styles.checkboxList}>
                  {filteredBrands.map((brand) => {
                    const isChecked = draftFilters.brand.includes(brand.slug);

                    return (
                      <label key={brand.slug} className={styles.checkboxOption}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMultiValue("brand", brand.slug)}
                        />
                        <span>{brand.name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.emptyMessage}>Бренд не знайдено</p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {sizeCount > 0 ? (
        <section className={styles.group}>
          <button
            type="button"
            className={styles.groupToggle}
            onClick={() => toggleGroup("size")}
            aria-expanded={openGroups.size}
          >
            <span>Розміри ({sizeCount})</span>
            <span className={styles.groupChevron}>{openGroups.size ? "−" : "+"}</span>
          </button>

          {openGroups.size ? (
            <div className={styles.groupBody}>
              <div className={styles.checkboxList}>
                {availableOptions.sizes.map((size) => (
                  <label key={size} className={styles.checkboxOption}>
                    <input
                      type="checkbox"
                      checked={draftFilters.size.includes(size)}
                      onChange={() => toggleMultiValue("size", size)}
                    />
                    <span>{size}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {colorCount > 0 ? (
        <section className={styles.group}>
          <button
            type="button"
            className={styles.groupToggle}
            onClick={() => toggleGroup("color")}
            aria-expanded={openGroups.color}
          >
            <span>Кольори ({colorCount})</span>
            <span className={styles.groupChevron}>{openGroups.color ? "−" : "+"}</span>
          </button>

          {openGroups.color ? (
            <div className={styles.groupBody}>
              <div className={styles.checkboxList}>
                {availableOptions.colors.map((color) => (
                  <label key={color} className={styles.checkboxOption}>
                    <input
                      type="checkbox"
                      checked={draftFilters.color.includes(color)}
                      onChange={() => toggleMultiValue("color", color)}
                    />
                    <span>{color}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {availabilityCount > 0 ? (
        <section className={styles.group}>
          <button
            type="button"
            className={styles.groupToggle}
            onClick={() => toggleGroup("availability")}
            aria-expanded={openGroups.availability}
          >
            <span>Наявність ({availabilityCount})</span>
            <span className={styles.groupChevron}>
              {openGroups.availability ? "−" : "+"}
            </span>
          </button>

          {openGroups.availability ? (
            <div className={styles.groupBody}>
              <div className={styles.checkboxList}>
                {availableOptions.availability.includes("in_stock") ? (
                  <label className={styles.checkboxOption}>
                    <input
                      type="checkbox"
                      checked={draftFilters.availability.includes("in_stock")}
                      onChange={() => toggleMultiValue("availability", "in_stock")}
                    />
                    <span>В наявності</span>
                  </label>
                ) : null}
                {availableOptions.availability.includes("out_of_stock") ? (
                  <label className={styles.checkboxOption}>
                    <input
                      type="checkbox"
                      checked={draftFilters.availability.includes("out_of_stock")}
                      onChange={() => toggleMultiValue("availability", "out_of_stock")}
                    />
                    <span>Немає в наявності</span>
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );

  return (
    <>
      <aside className={styles.sidebar}>
        <div className={styles.desktopHeader}>
          <div>
            <p className={styles.eyebrow}>Фільтри</p>
            <h2>Підібрати товари</h2>
          </div>
          <Link href="/catalog" className={styles.resetInline}>
            Очистити все
          </Link>
        </div>

        {renderedPanel}

        <div className={styles.desktopActions}>
          <button type="button" className={styles.applyButton} onClick={() => applyFilters()}>
            Застосувати
          </button>
          <button type="button" className={styles.secondaryButton} onClick={resetAll}>
            Скинути
          </button>
        </div>
      </aside>

      <section className={styles.mobileFilters}>
        <button
          type="button"
          className={styles.mobileOpenButton}
          onClick={() => setIsDrawerOpen(true)}
        >
          Фільтри
        </button>
      </section>

      {isDrawerOpen ? (
        <div className={styles.drawerOverlay} onClick={() => setIsDrawerOpen(false)}>
          <div
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Фільтри каталогу"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.drawerHeader}>
              <h2>Фільтри</h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Закрити фільтри"
              >
                ×
              </button>
            </div>

            {renderedPanel}

            <div className={styles.drawerActions}>
              <button type="button" className={styles.applyButton} onClick={() => applyFilters()}>
                Застосувати
              </button>
              <button type="button" className={styles.secondaryButton} onClick={resetAll}>
                Скинути
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

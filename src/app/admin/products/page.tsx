import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/Button";
import { AdminProductsToolbar } from "@/components/AdminProducts";
import styles from "@/components/AdminProducts/AdminProducts.module.css";
import { isSupabaseStorageUrl, isValidImageUrl } from "@/lib/images";
import {
  getAdminProductCategories,
  getAdminProducts,
} from "@/services/admin-products.service";
import type { AdminProductSort } from "@/types/admin-product";

export const dynamic = "force-dynamic";

type AdminProductsPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    sort?: string | string[];
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("uk-UA").format(value);
}

function getPrimaryVariant(product: Awaited<ReturnType<typeof getAdminProducts>>[number]) {
  return product.product_variants.find((variant) => variant.is_active) ?? null;
}

function getProductImage(product: Awaited<ReturnType<typeof getAdminProducts>>[number]) {
  const firstImage = product.product_images[0]?.image_url ?? null;

  if (isValidImageUrl(firstImage)) {
    return firstImage;
  }

  return isValidImageUrl(product.main_image_url) ? product.main_image_url : null;
}

function getDiscountLabel(product: Awaited<ReturnType<typeof getAdminProducts>>[number]) {
  const variant = getPrimaryVariant(product);

  if (!variant || !variant.old_price || variant.old_price <= variant.retail_price) {
    return null;
  }

  const discount = Math.round(
    ((variant.old_price - variant.retail_price) / variant.old_price) * 100
  );

  return `-${discount}%`;
}

export default async function AdminProductsPage({
  searchParams,
}: AdminProductsPageProps) {
  const params = await searchParams;
  const query = getSingleValue(params.q);
  const category = getSingleValue(params.category);
  const sort = (getSingleValue(params.sort) || "newest") as AdminProductSort;

  const [products, categories] = await Promise.all([
    getAdminProducts({
      q: query || null,
      category: category || null,
      sort,
    }),
    getAdminProductCategories(),
  ]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroHeader}>
          <div>
            <p className={styles.eyebrow}>Admin</p>
            <h1>ТОВАРИ</h1>
            <p>
              Таблиця читає товари напряму з Supabase і показує поточну назву,
              категорію, бренд, базову ціну та знижку за активним варіантом.
            </p>
          </div>

          <Button href="/admin/products/new">Додати товар</Button>
        </div>
      </section>

      <AdminProductsToolbar
        initialQuery={query}
        initialCategory={category}
        initialSort={sort}
        categories={categories}
      />

      {products.length > 0 ? (
        <section className={styles.tableSection}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <colgroup>
                <col className={styles.colProduct} />
                <col className={styles.colCategory} />
                <col className={styles.colBrand} />
                <col className={styles.colPrice} />
                <col className={styles.colDiscount} />
                <col className={styles.colCreated} />
                <col className={styles.colAction} />
              </colgroup>
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Категорія</th>
                  <th>Бренд</th>
                  <th>Ціна</th>
                  <th>Знижка</th>
                  <th>Створено</th>
                  <th>Дія</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const primaryVariant = getPrimaryVariant(product);
                  const imageUrl = getProductImage(product);
                  const discountLabel = getDiscountLabel(product);

                  return (
                    <tr key={product.id}>
                      <td>
                        <div className={styles.productCell}>
                          <div className={styles.imageWrap}>
                            {imageUrl ? (
                              <Image
                                src={imageUrl}
                                alt={product.name}
                                fill
                                sizes="76px"
                                unoptimized={isSupabaseStorageUrl(imageUrl)}
                                className={styles.image}
                              />
                            ) : (
                              <div className={styles.imageFallback}>SpecWear</div>
                            )}
                          </div>

                          <div className={styles.productInfo}>
                            <span className={styles.productName}>{product.name}</span>
                            {primaryVariant?.sku ? (
                              <span className={styles.meta}>SKU: {primaryVariant.sku}</span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className={styles.cellText}>
                        {product.category?.name ?? "Без категорії"}
                      </td>
                      <td className={styles.cellText}>
                        {product.brand?.name ?? "Без бренду"}
                      </td>
                      <td className={styles.price}>
                        {primaryVariant ? `${formatPrice(primaryVariant.retail_price)} грн` : "—"}
                      </td>
                      <td>{discountLabel ? <span className={styles.discount}>{discountLabel}</span> : "—"}</td>
                      <td>{formatDate(product.created_at)}</td>
                      <td>
                        <Link href={`/admin/products/${product.id}/edit`} className={styles.editButton}>
                          Редагувати
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.mobileCards}>
            {products.map((product) => {
              const primaryVariant = getPrimaryVariant(product);
              const imageUrl = getProductImage(product);
              const discountLabel = getDiscountLabel(product);

              return (
                <article key={product.id} className={styles.card}>
                  <div className={styles.productCell}>
                    <div className={styles.imageWrap}>
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={product.name}
                          fill
                          sizes="112px"
                          unoptimized={isSupabaseStorageUrl(imageUrl)}
                          className={styles.image}
                        />
                      ) : (
                        <div className={styles.imageFallback}>SpecWear</div>
                      )}
                    </div>

                    <div className={styles.productInfo}>
                      <span className={styles.productName}>{product.name}</span>
                      <span className={styles.meta}>
                        {product.category?.name ?? "Без категорії"}
                      </span>
                      <span className={styles.meta}>{product.brand?.name ?? "Без бренду"}</span>
                      {primaryVariant?.sku ? (
                        <span className={styles.meta}>SKU: {primaryVariant.sku}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.meta}>Ціна</span>
                    <strong className={styles.price}>
                      {primaryVariant ? `${formatPrice(primaryVariant.retail_price)} грн` : "—"}
                    </strong>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.meta}>Знижка</span>
                    {discountLabel ? <span className={styles.discount}>{discountLabel}</span> : <span>—</span>}
                  </div>

                  <div className={styles.cardFooter}>
                    <span className={styles.meta}>{formatDate(product.created_at)}</span>
                    <Link href={`/admin/products/${product.id}/edit`} className={styles.editButton}>
                      Редагувати
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <section className={styles.emptyState}>
          <h2>Товарів не знайдено</h2>
          <Link href="/admin/products" className={styles.resetLink}>
            Скинути фільтри
          </Link>
        </section>
      )}
    </main>
  );
}

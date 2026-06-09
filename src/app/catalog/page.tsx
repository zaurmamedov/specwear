import { ProductCard } from "@/components/ProductCard";
import { getProducts } from "@/services/products.service";

import styles from "./page.module.css";

export default async function CatalogPage() {
  const products = await getProducts();

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Каталог</p>
        <h1>СПЕЦОДЯГ, СПЕЦВЗУТТЯ ТА ЗАСОБИ ЗАХИСТУ</h1>
        <p>
          Каталог читає лише наявні дані з Supabase: товари, зображення, варіанти,
          бренди та категорії. Без кошика, обраного чи checkout-логіки на цьому етапі.
        </p>
        <span className={styles.summary}>Товарів у каталозі: {products.length}</span>
      </section>

      {products.length > 0 ? (
        <section className={styles.grid}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </section>
      ) : (
        <section className={styles.emptyState}>
          <p>У каталозі поки немає активних товарів для відображення.</p>
        </section>
      )}
    </main>
  );
}

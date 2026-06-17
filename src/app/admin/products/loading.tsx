import styles from "@/components/AdminProducts/AdminProducts.module.css";

export default function AdminProductsLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.emptyState}>
        <p className={styles.eyebrow}>Admin</p>
        <h1>Завантажуємо товари...</h1>
      </section>
    </main>
  );
}

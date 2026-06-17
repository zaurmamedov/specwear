import styles from "@/components/AdminProductEdit/AdminProductEdit.module.css";

export default function AdminProductEditLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.section}>
        <p className={styles.eyebrow}>Admin</p>
        <h1>Завантажуємо товар...</h1>
      </section>
    </main>
  );
}

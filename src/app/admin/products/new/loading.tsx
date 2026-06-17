import styles from "@/components/AdminProductEdit/AdminProductEdit.module.css";

export default function AdminProductCreateLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.section}>
        <p className={styles.eyebrow}>Admin</p>
        <h1>Готуємо форму нового товару...</h1>
      </section>
    </main>
  );
}

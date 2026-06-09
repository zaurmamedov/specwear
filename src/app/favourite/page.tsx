import { WishlistClient } from "@/components/Wishlist";
import styles from "@/components/Wishlist/Wishlist.module.css";

export default function FavouritePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>Список обраного</span>
        <h1>Обране</h1>
        <p>
          Зберігайте позиції для повторного перегляду, швидкого повернення до
          товару та подальшого додавання в кошик.
        </p>
      </section>

      <WishlistClient />
    </main>
  );
}

import { Button } from "@/components/Button";

import styles from "./page.module.css";

const categoryBlocks = [
  {
    title: "Спецодяг",
    description:
      "Робочий одяг для складів, виробництва, сервісних служб і щоденної зміни.",
  },
  {
    title: "Спецвзуття",
    description:
      "Взуття з акцентом на захист, зчеплення, комфорт протягом зміни та довговічність.",
  },
  {
    title: "Засоби захисту",
    description:
      "Каски, рукавички, окуляри, респіратори та інші категорії для безпечної роботи.",
  },
  {
    title: "Аксесуари",
    description:
      "Практичні доповнення для сезонних робіт, зберігання та щоденного використання.",
  },
];

const benefits = [
  "Роздрібні та оптові сценарії в одному магазині",
  "Структура готова до майбутнього підключення Supabase",
  "Зрозумілий UX для B2B і B2C клієнтів",
  "Індустріальний стиль із чистою подачею товарів",
];

export default function HomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.container}>
          <div className={styles.heroLayout}>
            <div className={styles.heroPanel}>
              <p className={styles.eyebrow}>ПЛАТФОРМА ДЛЯ СПЕЦОДЯГУ</p>
              <h1>
                ПРОФЕСІЙНИЙ СПЕЦОДЯГ ДЛЯ БРИГАД, ПІДРЯДНИКІВ ТА ЩОДЕННОЇ РОБОТИ
              </h1>
              <p className={styles.heroText}>
                SpecWear — це магазин спецодягу, спецвзуття та засобів
                індивідуального захисту з окремими сценаріями для роздрібних і
                оптових клієнтів.
              </p>
              <div className={styles.heroActions}>
                <Button href="/catalog" size="large">
                  Купити в роздріб
                </Button>
                <Button href="/wholesale" variant="outline" size="large">
                  Замовити оптом
                </Button>
              </div>
            </div>

            <aside className={styles.heroAside} aria-label="Ключові переваги SpecWear">
              <div className={styles.heroStat}>
                <span className={styles.heroStatLabel}>Формат</span>
                <strong>B2B / B2C</strong>
              </div>
              <div className={styles.heroStat}>
                <span className={styles.heroStatLabel}>Категорії</span>
                <strong>Спецодяг, взуття, ЗІЗ</strong>
              </div>
              <div className={styles.heroStat}>
                <span className={styles.heroStatLabel}>Основа</span>
                <strong>App Router + CSS Modules</strong>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>ОСНОВНІ КАТЕГОРІЇ</p>
            <h2>ЗРУЧНИЙ ПОШУК ТОВАРІВ ЗА КАТЕГОРІЯМИ</h2>
            <p>
              Каталог буде підключений до Supabase, тому структура сторінок має
              бути готовою до реальних товарів, категорій і фільтрів.
            </p>
          </div>
          <div className={styles.categoryGrid}>
            {categoryBlocks.map((category, index) => (
              <article key={category.title} className={styles.categoryCard}>
                <span className={styles.categoryIndex}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>{category.title}</h3>
                <p>{category.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.wholesalePanel}>
            <div className={styles.wholesaleHeading}>
              <p className={styles.eyebrow}>ОПТОВІ ЗАМОВЛЕННЯ</p>
              <h2>СТРУКТУРА ГОТОВА ДЛЯ КОМАНД, ПІДПРИЄМСТВ І РЕГУЛЯРНИХ ПОСТАВОК</h2>
            </div>
            <div className={styles.wholesaleCopy}>
              <p>
                Поточна база залишає місце для майбутніх заявок, корпоративних
                умов, історії замовлень і Supabase-логіки без штучних демо-даних
                на цьому етапі.
              </p>
              <Button href="/contacts" variant="primary">
                Зв’язатися з менеджером
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.benefitsSection}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>ЧОМУ ЦЯ СТРУКТУРА ПРАЦЮЄ</p>
            <h2>СПОЧАТКУ ЧИСТА АРХІТЕКТУРА, ПОТІМ ЛОГІКА КАТАЛОГУ</h2>
          </div>
          <div className={styles.benefitGrid}>
            {benefits.map((benefit) => (
              <article key={benefit} className={styles.benefitCard}>
                <span className={styles.benefitMarker} />
                <p>{benefit}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

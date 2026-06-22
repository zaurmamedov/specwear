import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/Button";
import { ProductCard } from "@/components/ProductCard/ProductCard";
import { getCategories } from "@/services/categories.service";
import { getProducts } from "@/services/products.service";
import type { Category } from "@/types/category";

import styles from "./page.module.css";

type HomeCategoryCard = {
  title: string;
  image: string;
  href: string;
  description: string;
};

const benefits = [
  {
    title: "Перевірені бренди",
    text: "Тільки надійні виробники для професійної щоденної роботи.",
  },
  {
    title: "Доставка по Україні",
    text: "Нова Пошта, Укрпошта, самовивіз та кур'єрські сценарії.",
  },
  {
    title: "Роздріб та опт",
    text: "Працюємо як з приватними покупцями, так і з командами.",
  },
  {
    title: "Консультація перед покупкою",
    text: "Допоможемо підібрати модель, розмір і потрібну комплектацію.",
  },
];

const brandLogos = [
  { src: "/brands/3M-logo.svg", alt: "3M" },
  { src: "/brands/deltaplus-logo.png", alt: "Delta Plus" },
  { src: "/brands/uvex-logo.svg", alt: "Uvex" },
  { src: "/brands/reis-logo.svg", alt: "Reis" },
];

const categoryContent = {
  specodyag: {
    title: "Спецодяг",
    image: "/home/category-workwear.webp",
    description: "Куртки, штани, комбінезони та робочі комплекти для щоденного навантаження.",
  },
  specvzuttya: {
    title: "Спецвзуття",
    image: "/home/category-footwear.webp",
    description: "Черевики, кросівки та моделі із захистом носка, підошви й зчеплення.",
  },
  ziz: {
    title: "Засоби індивідуального захисту",
    image: "/home/category-ppe.webp",
    description: "Окуляри, рукавички, респіратори, каски та інші засоби для безпечної роботи.",
  },
} satisfies Record<string, Omit<HomeCategoryCard, "href">>;

function findCategory(categories: Category[], matcher: (category: Category) => boolean) {
  return categories.find(matcher) ?? null;
}

function getHomeCategories(categories: Category[]): HomeCategoryCard[] {
  const workwear = findCategory(categories, (category) => category.slug === "specodyag");
  const footwear = findCategory(categories, (category) => category.slug === "specvzuttya");
  const ppe =
    findCategory(categories, (category) => category.slug === "ziz") ??
    findCategory(categories, (category) =>
      category.name.toLowerCase().includes("індивідуального захисту")
    );

  return [workwear, footwear, ppe]
    .filter((category): category is Category => Boolean(category))
    .map((category) => {
      const content =
        categoryContent[category.slug as keyof typeof categoryContent] ??
        categoryContent.ziz;

      return {
        title: content.title,
        image: content.image,
        description: content.description,
        href: `/catalog?category=${category.slug}`,
      };
    });
}

function getPopularProducts<T extends Awaited<ReturnType<typeof getProducts>>>(products: T) {
  const ranked = [...products].sort((left, right) => {
    const leftInStock = left.product_variants.some(
      (variant) => variant.is_active && variant.stock_quantity > 0 && variant.retail_price !== null
    );
    const rightInStock = right.product_variants.some(
      (variant) => variant.is_active && variant.stock_quantity > 0 && variant.retail_price !== null
    );

    if (leftInStock !== rightInStock) {
      return leftInStock ? -1 : 1;
    }

    if (left.is_featured !== right.is_featured) {
      return left.is_featured ? -1 : 1;
    }

    if (left.is_new !== right.is_new) {
      return left.is_new ? -1 : 1;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });

  return ranked.slice(0, 6);
}

export default async function HomePage() {
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ sort: "default" }),
  ]);

  const homeCategories = getHomeCategories(categories);
  const popularProducts = getPopularProducts(products);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <Image
          src="/home/hero.webp"
          alt="SpecWear hero"
          fill
          priority
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroOverlay} />

        <div className={styles.container}>
          <div className={styles.heroContent}>
            <div className={styles.heroPanel}>
              <p className={styles.heroEyebrow}>SpecWear</p>
              <h1>Спецодяг, спецвзуття та ЗІЗ для роботи</h1>
              <p className={styles.heroText}>
                Надійне екіпірування для будівництва, виробництва, складу, сервісу
                та щоденної роботи.
              </p>
              <div className={styles.heroActions}>
                <Button href="/catalog" size="large">
                  Перейти в каталог
                </Button>
                <Button href="/contacts" variant="outline" size="large">
                  Отримати консультацію
                </Button>
              </div>
            </div>
          </div>

          <div className={styles.benefitsStrip}>
            {benefits.map((benefit, index) => (
              <article key={benefit.title} className={styles.benefitItem}>
                <span className={styles.benefitIcon} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className={styles.benefitCopy}>
                  <h2>{benefit.title}</h2>
                  <p>{benefit.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Категорії</p>
              <h2>Підберіть екіпірування за напрямом роботи</h2>
            </div>
          </div>

          <div className={styles.categoryGrid}>
            {homeCategories.map((category) => (
              <Link key={category.href} href={category.href} className={styles.categoryCard}>
                <div className={styles.categoryImageWrap}>
                  <Image
                    src={category.image}
                    alt={category.title}
                    fill
                    sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
                    className={styles.categoryImage}
                  />
                </div>
                <div className={styles.categoryBody}>
                  <h3>{category.title}</h3>
                  <p>{category.description}</p>
                  <span className={styles.categoryLink}>Перейти в категорію</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Популярне зараз</p>
              <h2>Товари, які обирають найчастіше</h2>
            </div>
            <Link href="/catalog" className={styles.sectionLink}>
              Дивитися всі товари
            </Link>
          </div>

          <div className={styles.productsGrid}>
            {popularProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.audienceGrid}>
            <article className={`${styles.audienceCard} ${styles.audienceCardDark}`}>
              <div className={styles.audienceContent}>
                <p className={styles.sectionEyebrow}>Для роздрібних покупців</p>
                <h2>Замовляйте одиничні товари з доставкою по Україні</h2>
                <p>
                  Швидко знаходьте потрібні моделі, оформлюйте замовлення онлайн
                  та отримуйте екіпірування без зайвих складнощів.
                </p>
                <Button href="/catalog">Перейти в каталог</Button>
              </div>
            </article>

            <article className={styles.audienceCard}>
              <div className={styles.audienceContent}>
                <p className={styles.sectionEyebrow}>Для бізнесу та команд</p>
                <h2>Підберемо партію спецодягу, взуття та ЗІЗ під ваші задачі</h2>
                <p>
                  Працюємо з командами, підрядниками, виробництвом і сервісними
                  службами. Формуємо зручний сценарій під закупівлю.
                </p>
                <Button href="/wholesale" variant="outline" className={styles.lightOutline}>
                  Оптовим клієнтам
                </Button>
              </div>
              <div className={styles.audienceImageWrap}>
                <Image
                  src="/home/business.webp"
                  alt="Оптові клієнти SpecWear"
                  fill
                  sizes="(max-width: 767px) 100vw, 42vw"
                  className={styles.audienceImage}
                />
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Бренди</p>
              <h2>Працюємо з брендами, яким довіряють</h2>
            </div>
          </div>

          <div className={styles.brandStrip}>
            {brandLogos.map((brand) => (
              <div key={brand.alt} className={styles.brandCard}>
                <Image
                  src={brand.src}
                  alt={brand.alt}
                  width={180}
                  height={72}
                  className={styles.brandLogo}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionLast}`}>
        <div className={styles.container}>
          <article className={styles.consultation}>
            <div className={styles.consultationContent}>
              <p className={styles.sectionEyebrow}>Консультація</p>
              <h2>Не знаєте, що обрати?</h2>
              <p>
                Допоможемо підібрати розмір, модель та комплектацію під ваші
                задачі.
              </p>
              <Button href="/contacts">Зв&apos;язатися</Button>
            </div>

            <div className={styles.consultationImageWrap}>
              <Image
                src="/home/consultation.webp"
                alt="Консультація SpecWear"
                fill
                sizes="(max-width: 767px) 100vw, 40vw"
                className={styles.consultationImage}
              />
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

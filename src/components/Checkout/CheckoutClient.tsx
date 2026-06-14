"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FocusEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/Button";
import { isSupabaseStorageUrl } from "@/lib/images";
import { supabase } from "@/lib/supabase/client";
import { useCartStore } from "@/stores/cart.store";

import styles from "./Checkout.module.css";

type CustomerType = "retail" | "wholesale";
type DeliveryService = "nova_poshta" | "ukrposhta" | "pickup";
type DeliveryMethod = "branch" | "locker" | "courier" | "pickup";

type CheckoutFormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  customerType: CustomerType;
  deliveryService: DeliveryService;
  deliveryMethod: DeliveryMethod;
  deliveryCity: string;
  deliveryWarehouse: string;
  deliveryAddress: string;
  comment: string;
};

type CheckoutFieldName =
  | "firstName"
  | "lastName"
  | "phone"
  | "email"
  | "deliveryCity";

type CheckoutFieldErrors = Record<CheckoutFieldName, string | null>;
type CheckoutTouchedState = Record<CheckoutFieldName, boolean>;

const initialFormState: CheckoutFormState = {
  firstName: "",
  lastName: "",
  phone: "+380",
  email: "",
  customerType: "retail",
  deliveryService: "nova_poshta",
  deliveryMethod: "branch",
  deliveryCity: "",
  deliveryWarehouse: "",
  deliveryAddress: "",
  comment: "",
};

const deliveryMethodOptions: Record<
  DeliveryService,
  Array<{ value: DeliveryMethod; label: string }>
> = {
  nova_poshta: [
    { value: "branch", label: "Відділення" },
    { value: "locker", label: "Поштомат" },
    { value: "courier", label: "Кур'єр" },
  ],
  ukrposhta: [
    { value: "branch", label: "Відділення" },
    { value: "locker", label: "Поштомат" },
  ],
  pickup: [{ value: "pickup", label: "Самовивіз" }],
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("uk-UA").format(price);
}

function getMethodFieldLabel(method: DeliveryMethod) {
  if (method === "locker") {
    return "Поштомат";
  }

  if (method === "pickup") {
    return "Точка самовивозу";
  }

  return "Відділення";
}

function validatePhone(phone: string) {
  return /^\+380\d{9}$/.test(phone.trim());
}

function validateEmail(email: string) {
  if (email.trim() === "") {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function CheckoutClient() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);

  const [form, setForm] = useState<CheckoutFormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [touched, setTouched] = useState<CheckoutTouchedState>({
    firstName: false,
    lastName: false,
    phone: false,
    email: false,
    deliveryCity: false,
  });
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const deliveryCityRef = useRef<HTMLInputElement>(null);

  const subtotal = useMemo(
    () => items.reduce((total, item) => total + (item.price ?? 0) * item.quantity, 0),
    [items]
  );
  const deliveryPrice = 0;
  const total = subtotal + deliveryPrice;
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);

  const currentMethodOptions = deliveryMethodOptions[form.deliveryService];
  const isCourier = form.deliveryMethod === "courier";
  const needsWarehouse =
    form.deliveryMethod === "branch" ||
    form.deliveryMethod === "locker" ||
    form.deliveryMethod === "pickup";

  const validationErrors: CheckoutFieldErrors = {
    firstName: form.firstName.trim() === "" ? "Введіть ім'я" : null,
    lastName: form.lastName.trim() === "" ? "Введіть прізвище" : null,
    phone: validatePhone(form.phone) ? null : "Введіть коректний номер телефону",
    email: validateEmail(form.email) ? null : "Введіть коректний email",
    deliveryCity: form.deliveryCity.trim() === "" ? "Вкажіть місто доставки" : null,
  };

  const isFormValid = Object.values(validationErrors).every((value) => value === null);
  const canSubmit = items.length > 0 && isFormValid && !isSubmitting;

  function updateField<Key extends keyof CheckoutFormState>(
    key: Key,
    value: CheckoutFormState[Key]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function markFieldTouched(field: CheckoutFieldName) {
    setTouched((current) => ({
      ...current,
      [field]: true,
    }));
  }

  function handleFieldBlur(event: FocusEvent<HTMLInputElement>) {
    markFieldTouched(event.target.name as CheckoutFieldName);
  }

  function focusFirstInvalidField(errors: CheckoutFieldErrors) {
    const fieldOrder: Array<{
      name: CheckoutFieldName;
      ref: React.RefObject<HTMLInputElement | null>;
    }> = [
      { name: "firstName", ref: firstNameRef },
      { name: "lastName", ref: lastNameRef },
      { name: "phone", ref: phoneRef },
      { name: "email", ref: emailRef },
      { name: "deliveryCity", ref: deliveryCityRef },
    ];

    const firstInvalid = fieldOrder.find((field) => errors[field.name] !== null);

    if (!firstInvalid?.ref.current) {
      return;
    }

    firstInvalid.ref.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    firstInvalid.ref.current.focus();
  }

  function handleServiceChange(event: ChangeEvent<HTMLInputElement>) {
    const nextService = event.target.value as DeliveryService;
    const nextMethod = deliveryMethodOptions[nextService][0]?.value ?? "branch";

    setForm((current) => ({
      ...current,
      deliveryService: nextService,
      deliveryMethod: nextMethod,
      deliveryWarehouse: "",
      deliveryAddress: "",
    }));
  }

  function handleMethodChange(event: ChangeEvent<HTMLInputElement>) {
    const nextMethod = event.target.value as DeliveryMethod;

    setForm((current) => ({
      ...current,
      deliveryMethod: nextMethod,
      deliveryWarehouse: nextMethod === "courier" ? "" : current.deliveryWarehouse,
      deliveryAddress: nextMethod === "courier" ? current.deliveryAddress : "",
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      setTouched({
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        deliveryCity: true,
      });
      focusFirstInvalidField(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const orderId = crypto.randomUUID();
      const orderPayload = {
        id: orderId,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        customer_type: form.customerType,
        delivery_service: form.deliveryService,
        delivery_method: form.deliveryMethod,
        delivery_city: form.deliveryCity.trim(),
        delivery_city_ref: null,
        delivery_warehouse: needsWarehouse ? form.deliveryWarehouse.trim() || null : null,
        delivery_warehouse_ref: null,
        delivery_address: isCourier ? form.deliveryAddress.trim() || null : null,
        comment: form.comment.trim() || null,
        subtotal,
        delivery_price: deliveryPrice,
        total,
        status: "new",
      };

      const { error: orderError } = await supabase
        .from("orders")
        .insert(orderPayload);

      if (orderError) {
        throw new Error(orderError.message ?? "Не вдалося створити замовлення.");
      }

      const orderItemsPayload = items
        .filter((item) => item.price !== null)
        .map((item) => ({
          order_id: orderId,
          product_id: item.productId,
          variant_id: item.variantId ?? null,
          product_name: item.name,
          product_slug: item.slug,
          image_url: item.imageUrl,
          sku: item.sku ?? null,
          size: item.size ?? null,
          color: item.color ?? null,
          brand_name: item.brandName ?? null,
          category_name: item.categoryName ?? null,
          price: item.price ?? 0,
          quantity: item.quantity,
          total: (item.price ?? 0) * item.quantity,
        }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItemsPayload);

      if (itemsError) {
        throw new Error(itemsError.message);
      }

      clearCart();
      router.replace(`/checkout/success?order=${orderId}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? `Не вдалося оформити замовлення: ${error.message}`
          : "Не вдалося оформити замовлення."
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.layout}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>Контактні дані</p>
            <h2>Оформлення замовлення</h2>
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span>Ім&apos;я *</span>
              <input
                type="text"
                name="firstName"
                value={form.firstName}
                ref={firstNameRef}
                onChange={(event) => updateField("firstName", event.target.value)}
                onBlur={handleFieldBlur}
                aria-invalid={validationErrors.firstName !== null}
                required
              />
              {touched.firstName && validationErrors.firstName ? (
                <span className={styles.fieldError}>{validationErrors.firstName}</span>
              ) : null}
            </label>

            <label className={styles.field}>
              <span>Прізвище *</span>
              <input
                type="text"
                name="lastName"
                value={form.lastName}
                ref={lastNameRef}
                onChange={(event) => updateField("lastName", event.target.value)}
                onBlur={handleFieldBlur}
                aria-invalid={validationErrors.lastName !== null}
                required
              />
              {touched.lastName && validationErrors.lastName ? (
                <span className={styles.fieldError}>{validationErrors.lastName}</span>
              ) : null}
            </label>

            <label className={styles.field}>
              <span>Телефон *</span>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                ref={phoneRef}
                onChange={(event) => updateField("phone", event.target.value)}
                onBlur={handleFieldBlur}
                aria-invalid={validationErrors.phone !== null}
                required
              />
              {touched.phone && validationErrors.phone ? (
                <span className={styles.fieldError}>{validationErrors.phone}</span>
              ) : null}
            </label>

            <label className={styles.field}>
              <span>Email</span>
              <input
                type="email"
                name="email"
                value={form.email}
                ref={emailRef}
                onChange={(event) => updateField("email", event.target.value)}
                onBlur={handleFieldBlur}
                aria-invalid={validationErrors.email !== null}
              />
              {touched.email && validationErrors.email ? (
                <span className={styles.fieldError}>{validationErrors.email}</span>
              ) : null}
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.eyebrow}>Тип клієнта</p>
          <div className={styles.choiceRow}>
            <label className={styles.choice}>
              <input
                type="radio"
                name="customerType"
                value="retail"
                checked={form.customerType === "retail"}
                onChange={() => updateField("customerType", "retail")}
              />
              <span>Роздрібний</span>
            </label>

            <label className={styles.choice}>
              <input
                type="radio"
                name="customerType"
                value="wholesale"
                checked={form.customerType === "wholesale"}
                onChange={() => updateField("customerType", "wholesale")}
              />
              <span>Оптовий</span>
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.eyebrow}>Доставка</p>
          <div className={styles.choiceGrid}>
            <label className={styles.choice}>
              <input
                type="radio"
                name="deliveryService"
                value="nova_poshta"
                checked={form.deliveryService === "nova_poshta"}
                onChange={handleServiceChange}
              />
              <span>Нова Пошта</span>
            </label>

            <label className={styles.choice}>
              <input
                type="radio"
                name="deliveryService"
                value="ukrposhta"
                checked={form.deliveryService === "ukrposhta"}
                onChange={handleServiceChange}
              />
              <span>Укрпошта</span>
            </label>

            <label className={styles.choice}>
              <input
                type="radio"
                name="deliveryService"
                value="pickup"
                checked={form.deliveryService === "pickup"}
                onChange={handleServiceChange}
              />
              <span>Самовивіз</span>
            </label>
          </div>

          <div className={styles.choiceRow}>
            {currentMethodOptions.map((option) => (
              <label key={option.value} className={styles.choice}>
                <input
                  type="radio"
                  name="deliveryMethod"
                  value={option.value}
                  checked={form.deliveryMethod === option.value}
                  onChange={handleMethodChange}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.eyebrow}>Дані доставки</p>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span>Місто *</span>
              <input
                type="text"
                name="deliveryCity"
                value={form.deliveryCity}
                ref={deliveryCityRef}
                onChange={(event) => updateField("deliveryCity", event.target.value)}
                onBlur={handleFieldBlur}
                aria-invalid={validationErrors.deliveryCity !== null}
                required
              />
              {touched.deliveryCity && validationErrors.deliveryCity ? (
                <span className={styles.fieldError}>{validationErrors.deliveryCity}</span>
              ) : null}
            </label>

            {needsWarehouse ? (
              <label className={styles.field}>
                <span>{getMethodFieldLabel(form.deliveryMethod)}</span>
                <input
                  type="text"
                  value={form.deliveryWarehouse}
                  onChange={(event) => updateField("deliveryWarehouse", event.target.value)}
                />
              </label>
            ) : null}

            {isCourier ? (
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span>Адреса</span>
                <input
                  type="text"
                  value={form.deliveryAddress}
                  onChange={(event) => updateField("deliveryAddress", event.target.value)}
                />
              </label>
            ) : null}

            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>Коментар до замовлення</span>
              <textarea
                rows={4}
                value={form.comment}
                onChange={(event) => updateField("comment", event.target.value)}
              />
            </label>
          </div>
        </section>

        {submitError ? <p className={styles.error}>{submitError}</p> : null}

        <div className={styles.submitRow}>
          <Button type="submit" size="large" disabled={!canSubmit}>
            {isSubmitting ? "Оформляємо..." : "Оформити замовлення"}
          </Button>
          {!isFormValid ? (
            <p className={styles.helper}>
              Заповніть обов&apos;язкові поля для оформлення замовлення.
            </p>
          ) : null}
          {items.length === 0 ? (
            <p className={styles.helper}>Кошик порожній. Додайте товари перед оформленням.</p>
          ) : null}
        </div>
      </form>

      <aside className={styles.summary}>
        <div className={styles.summaryHeader}>
          <p className={styles.eyebrow}>Ваше замовлення</p>
          <h2>Підсумок</h2>
        </div>

        {items.length > 0 ? (
          <div className={styles.summaryItems}>
            {items.map((item) => {
              const itemSubtotal = (item.price ?? 0) * item.quantity;

              return (
                <article
                  key={`${item.productId}-${item.variantId ?? "default"}`}
                  className={styles.summaryItem}
                >
                  <div className={styles.itemImage}>
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        fill
                        unoptimized={isSupabaseStorageUrl(item.imageUrl)}
                        sizes="96px"
                        className={styles.itemImageTag}
                      />
                    ) : (
                      <div className={styles.imageFallback}>SpecWear</div>
                    )}
                  </div>

                  <div className={styles.itemBody}>
                    <h3>{item.name}</h3>
                    <div className={styles.itemMeta}>
                      {item.size ? <span>Розмір: {item.size}</span> : null}
                      {item.color ? <span>Колір: {item.color}</span> : null}
                      {item.sku ? <span>SKU: {item.sku}</span> : null}
                    </div>
                    <div className={styles.itemFooter}>
                      <span>{item.quantity} x {formatPrice(item.price ?? 0)} грн</span>
                      <strong>{formatPrice(itemSubtotal)} грн</strong>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptySummary}>
            <p>У кошику ще немає товарів для оформлення.</p>
            <Button href="/catalog" variant="outline">
              Перейти в каталог
            </Button>
          </div>
        )}

        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span>Позицій</span>
            <strong>{itemCount}</strong>
          </div>
          <div className={styles.totalRow}>
            <span>Підсумок</span>
            <strong>{formatPrice(subtotal)} грн</strong>
          </div>
          <div className={styles.totalRow}>
            <span>Доставка</span>
            <strong>{formatPrice(deliveryPrice)} грн</strong>
          </div>
          <div className={`${styles.totalRow} ${styles.totalRowPrimary}`}>
            <span>Разом</span>
            <strong>{formatPrice(total)} грн</strong>
          </div>
        </div>
      </aside>
    </div>
  );
}

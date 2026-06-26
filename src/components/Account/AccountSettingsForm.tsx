"use client";

import { useMemo, useState } from "react";

import { CustomerLogoutButton } from "@/components/Auth";
import { Button } from "@/components/Button";
import type { Profile } from "@/types/profile";

import styles from "./Account.module.css";

type AccountSettingsFormProps = {
  profile: Profile | null;
  email: string;
};

type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  deliveryService: string;
  deliveryMethod: string;
  deliveryCity: string;
  deliveryCityRef: string;
  deliveryWarehouse: string;
  deliveryWarehouseRef: string;
  deliveryAddress: string;
};

function validatePhone(phone: string) {
  return phone.trim() === "" || /^\+380\d{9}$/.test(phone.trim());
}

export function AccountSettingsForm({
  profile,
  email,
}: AccountSettingsFormProps) {
  const [form, setForm] = useState<FormState>({
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    phone: profile?.phone ?? "+380",
    deliveryService: profile?.delivery_service ?? "nova_poshta",
    deliveryMethod: profile?.delivery_method ?? "branch",
    deliveryCity: profile?.delivery_city ?? "",
    deliveryCityRef: profile?.delivery_city_ref ?? "",
    deliveryWarehouse: profile?.delivery_warehouse ?? "",
    deliveryWarehouseRef: profile?.delivery_warehouse_ref ?? "",
    deliveryAddress: profile?.delivery_address ?? "",
  });
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validationError = useMemo(() => {
    if (!form.firstName.trim()) {
      return "Введіть ім'я";
    }

    if (!form.lastName.trim()) {
      return "Введіть прізвище";
    }

    if (!validatePhone(form.phone)) {
      return "Введіть коректний номер телефону";
    }

    return null;
  }, [form.firstName, form.lastName, form.phone]);

  return (
    <section className={styles.settingsCard}>
      <div className={styles.settingsHeader}>
        <p className={styles.eyebrow}>Налаштування</p>
        <h1>Налаштування</h1>
        <p className={styles.settingsIntro}>
          Збережіть особисті дані та параметри доставки за замовчуванням, щоб швидше
          оформлювати наступні замовлення.
        </p>
      </div>

      <form
        className={styles.settingsCard}
        onSubmit={async (event) => {
          event.preventDefault();

          if (validationError) {
            setSubmitError(validationError);
            setSubmitMessage(null);
            return;
          }

          setSubmitError(null);
          setSubmitMessage(null);
          setIsSubmitting(true);

          try {
            const response = await fetch("/api/account/profile", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(form),
            });

            const payload = (await response.json()) as { error?: string };

            if (!response.ok) {
              throw new Error(payload.error ?? "Не вдалося зберегти дані.");
            }

            setSubmitMessage("Дані збережено");
          } catch (error) {
            setSubmitError(
              error instanceof Error ? error.message : "Не вдалося зберегти дані."
            );
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <section className={styles.settingsSection}>
          <div className={styles.sectionHeader}>
            <h2>Особисті дані</h2>
            <p className={styles.sectionDescription}>
              Контактна інформація для замовлень та швидкого автозаповнення checkout.
            </p>
          </div>

          <div className={styles.settingsGrid}>
            <div className={styles.field}>
              <label htmlFor="settings-first-name">Ім&apos;я</label>
              <input
                id="settings-first-name"
                className={styles.input}
                value={form.firstName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, firstName: event.target.value }))
                }
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="settings-last-name">Прізвище</label>
              <input
                id="settings-last-name"
                className={styles.input}
                value={form.lastName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, lastName: event.target.value }))
                }
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="settings-phone">Телефон</label>
              <input
                id="settings-phone"
                className={styles.input}
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="settings-email">Email</label>
              <input
                id="settings-email"
                className={`${styles.input} ${styles.readonly}`}
                value={email}
                readOnly
              />
            </div>
          </div>
        </section>

        <section className={styles.settingsSection}>
          <div className={styles.sectionHeader}>
            <h2>Доставка</h2>
            <p className={styles.sectionDescription}>
              Збережіть типові параметри доставки для майбутніх замовлень.
            </p>
          </div>

          <div className={styles.settingsGrid}>
            <div className={styles.field}>
              <label htmlFor="settings-delivery-service">Служба доставки</label>
              <select
                id="settings-delivery-service"
                className={styles.select}
                value={form.deliveryService}
                onChange={(event) =>
                  setForm((current) => ({ ...current, deliveryService: event.target.value }))
                }
              >
                <option value="nova_poshta">Нова Пошта</option>
                <option value="ukrposhta">Укрпошта</option>
                <option value="pickup">Самовивіз</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="settings-delivery-method">Спосіб доставки</label>
              <select
                id="settings-delivery-method"
                className={styles.select}
                value={form.deliveryMethod}
                onChange={(event) =>
                  setForm((current) => ({ ...current, deliveryMethod: event.target.value }))
                }
              >
                <option value="branch">Відділення</option>
                <option value="locker">Поштомат</option>
                <option value="courier">Кур&apos;єр</option>
                <option value="pickup">Самовивіз</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="settings-city">Місто</label>
              <input
                id="settings-city"
                className={styles.input}
                value={form.deliveryCity}
                onChange={(event) =>
                  setForm((current) => ({ ...current, deliveryCity: event.target.value }))
                }
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="settings-city-ref">City Ref</label>
              <input
                id="settings-city-ref"
                className={styles.input}
                value={form.deliveryCityRef}
                onChange={(event) =>
                  setForm((current) => ({ ...current, deliveryCityRef: event.target.value }))
                }
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="settings-warehouse">Відділення / поштомат</label>
              <input
                id="settings-warehouse"
                className={styles.input}
                value={form.deliveryWarehouse}
                onChange={(event) =>
                  setForm((current) => ({ ...current, deliveryWarehouse: event.target.value }))
                }
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="settings-warehouse-ref">Warehouse Ref</label>
              <input
                id="settings-warehouse-ref"
                className={styles.input}
                value={form.deliveryWarehouseRef}
                onChange={(event) =>
                  setForm((current) => ({ ...current, deliveryWarehouseRef: event.target.value }))
                }
              />
            </div>

            <div className={styles.fieldFull}>
              <label htmlFor="settings-address">Адреса</label>
              <input
                id="settings-address"
                className={styles.input}
                value={form.deliveryAddress}
                onChange={(event) =>
                  setForm((current) => ({ ...current, deliveryAddress: event.target.value }))
                }
              />
            </div>
          </div>
        </section>

        {submitError ? <p className={styles.error}>{submitError}</p> : null}
        {submitMessage ? <p className={styles.successMessage}>{submitMessage}</p> : null}

        <div className={styles.settingsActions}>
          <Button type="submit" disabled={isSubmitting}>
            Зберегти
          </Button>
          <CustomerLogoutButton />
        </div>
      </form>
    </section>
  );
}

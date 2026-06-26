"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/Button";

import styles from "./Auth.module.css";

type CustomerRegisterFormProps = {
  redirectTo: string;
};

function validatePhone(phone: string) {
  return /^\+380\d{9}$/.test(phone.trim());
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function CustomerRegisterForm({ redirectTo }: CustomerRegisterFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("+380");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validationError = useMemo(() => {
    if (!firstName.trim()) {
      return "Введіть ім'я";
    }

    if (!lastName.trim()) {
      return "Введіть прізвище";
    }

    if (!validatePhone(phone)) {
      return "Введіть коректний номер телефону";
    }

    if (!validateEmail(email)) {
      return "Введіть коректний email";
    }

    if (password.length < 8) {
      return "Пароль має містити щонайменше 8 символів";
    }

    if (password !== confirmPassword) {
      return "Паролі не співпадають";
    }

    return null;
  }, [confirmPassword, email, firstName, lastName, password, phone]);

  return (
    <form
      className={styles.form}
      onSubmit={async (event) => {
        event.preventDefault();

        if (validationError) {
          setSubmitError(validationError);
          return;
        }

        setSubmitError(null);
        setIsSubmitting(true);

        try {
          const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              firstName,
              lastName,
              phone,
              email,
              password,
            }),
          });

          const payload = (await response.json()) as { error?: string };

          if (!response.ok) {
            throw new Error(payload.error ?? "Не вдалося створити акаунт.");
          }

          router.push(redirectTo || "/account");
          router.refresh();
        } catch (error) {
          setSubmitError(
            error instanceof Error ? error.message : "Не вдалося створити акаунт."
          );
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <div className={styles.grid}>
        <div className={styles.field}>
          <label htmlFor="register-first-name">Ім&apos;я</label>
          <input
            id="register-first-name"
            className={styles.input}
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="register-last-name">Прізвище</label>
          <input
            id="register-last-name"
            className={styles.input}
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="register-phone">Телефон</label>
          <input
            id="register-phone"
            className={styles.input}
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            type="email"
            className={styles.input}
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="register-password">Пароль</label>
          <input
            id="register-password"
            type="password"
            className={styles.input}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="register-confirm-password">Підтвердження пароля</label>
          <input
            id="register-confirm-password"
            type="password"
            className={styles.input}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </div>
      </div>

      {submitError ? <p className={styles.error}>{submitError}</p> : null}

      <div className={styles.actions}>
        <Button type="submit" size="large" disabled={isSubmitting}>
          Зареєструватися
        </Button>
        <p className={styles.helper}>
          Уже є акаунт?{" "}
          <Link href={`/login${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}>
            Увійти
          </Link>
        </p>
      </div>
    </form>
  );
}

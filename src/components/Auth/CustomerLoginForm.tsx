"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";

import styles from "./Auth.module.css";

type CustomerLoginFormProps = {
  redirectTo: string;
};

export function CustomerLoginForm({ redirectTo }: CustomerLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className={styles.form}
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
          const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              password,
            }),
          });

          const payload = (await response.json()) as { error?: string };

          if (!response.ok) {
            throw new Error(payload.error ?? "Не вдалося виконати вхід.");
          }

          router.push(redirectTo || "/account");
          router.refresh();
        } catch (submitError) {
          setError(
            submitError instanceof Error
              ? submitError.message
              : "Не вдалося виконати вхід."
          );
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <div className={styles.fullWidth}>
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          className={styles.input}
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      <div className={styles.fullWidth}>
        <label htmlFor="login-password">Пароль</label>
        <input
          id="login-password"
          type="password"
          className={styles.input}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <Button type="submit" size="large" disabled={isSubmitting}>
          Увійти
        </Button>
        <p className={styles.helper}>
          Немає акаунта?{" "}
          <Link href={`/register${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}>
            Зареєструватися
          </Link>
        </p>
      </div>
    </form>
  );
}

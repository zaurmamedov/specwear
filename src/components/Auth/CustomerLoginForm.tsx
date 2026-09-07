"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/Button";
import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";
import { getSafeCustomerRedirect } from "@/lib/auth-redirect";
import {
  TURNSTILE_EXPIRED_MESSAGE,
  TURNSTILE_LOAD_ERROR_MESSAGE,
  TURNSTILE_REQUIRED_MESSAGE,
} from "@/lib/security/turnstile.shared";

import styles from "./Auth.module.css";

type CustomerLoginFormProps = {
  developmentWarning?: string | null;
  redirectTo: string;
};

export function CustomerLoginForm({
  developmentWarning = null,
  redirectTo,
}: CustomerLoginFormProps) {
  const router = useRouter();
  const safeRedirectTo = getSafeCustomerRedirect(redirectTo);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  return (
    <form
      className={styles.form}
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);

        if (!turnstileToken) {
          setError(TURNSTILE_REQUIRED_MESSAGE);
          return;
        }

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
              turnstileToken,
            }),
          });

          const payload = (await response.json()) as { error?: string };

          if (!response.ok) {
            throw new Error(payload.error ?? "Не вдалося виконати вхід.");
          }

          router.push(safeRedirectTo);
          router.refresh();
        } catch (submitError) {
          setTurnstileToken(null);
          turnstileRef.current?.reset();
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

      {developmentWarning ? <p className={styles.warning}>{developmentWarning}</p> : null}

      <Turnstile
        ref={turnstileRef}
        onVerify={(token) => {
          setTurnstileToken(token);
          setError((current) =>
            current === TURNSTILE_REQUIRED_MESSAGE ||
            current === TURNSTILE_EXPIRED_MESSAGE ||
            current === TURNSTILE_LOAD_ERROR_MESSAGE
              ? null
              : current
          );
        }}
        onExpire={() => {
          setTurnstileToken(null);
          setError(TURNSTILE_EXPIRED_MESSAGE);
        }}
        onError={() => {
          setTurnstileToken(null);
          setError(TURNSTILE_LOAD_ERROR_MESSAGE);
        }}
        onUnsupported={() => {
          setTurnstileToken(null);
          setError(TURNSTILE_LOAD_ERROR_MESSAGE);
        }}
      />

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <Button type="submit" size="large" disabled={isSubmitting || !turnstileToken}>
          Увійти
        </Button>
        <p className={styles.helper}>
          Немає акаунта?{" "}
          <Link href={`/register?redirectTo=${encodeURIComponent(safeRedirectTo)}`}>
            Зареєструватися
          </Link>
        </p>
      </div>
    </form>
  );
}

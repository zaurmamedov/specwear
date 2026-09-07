"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/Button";
import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";
import { getSafeAdminRedirect } from "@/lib/auth-redirect";
import {
  TURNSTILE_EXPIRED_MESSAGE,
  TURNSTILE_LOAD_ERROR_MESSAGE,
  TURNSTILE_REQUIRED_MESSAGE,
} from "@/lib/security/turnstile.shared";

import styles from "./AdminAuth.module.css";

type AdminLoginFormProps = {
  developmentWarning?: string | null;
  nextPath: string;
};

export function AdminLoginForm({
  developmentWarning = null,
  nextPath,
}: AdminLoginFormProps) {
  const router = useRouter();
  const safeNextPath = getSafeAdminRedirect(nextPath);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!turnstileToken) {
      setError(TURNSTILE_REQUIRED_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          turnstileToken,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Не вдалося увійти до адмін-панелі.");
      }

      router.replace(safeNextPath);
      router.refresh();
    } catch (caughtError) {
      setTurnstileToken(null);
      turnstileRef.current?.reset();
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Не вдалося увійти до адмін-панелі."
      );
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.loginForm} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
        />
      </label>

      <label className={styles.field}>
        <span>Пароль</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </label>

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

      <Button type="submit" size="large" disabled={isSubmitting || !turnstileToken}>
        {isSubmitting ? "Входимо..." : "Увійти"}
      </Button>
    </form>
  );
}

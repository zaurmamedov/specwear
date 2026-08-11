"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";

import styles from "./CustomerLogoutButton.module.css";

type CustomerLogoutButtonProps = {
  className?: string;
};

export function CustomerLogoutButton({ className }: CustomerLogoutButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="secondary"
        size="small"
        className={className}
        disabled={isSubmitting}
        onClick={async () => {
          setIsSubmitting(true);
          setError(null);

          try {
            const response = await fetch("/api/auth/logout", {
              method: "POST",
              credentials: "same-origin",
              cache: "no-store",
            });

            if (!response.ok) {
              throw new Error("Logout request failed.");
            }

            router.replace("/login");
            router.refresh();
          } catch {
            setError("Не вдалося завершити сесію. Спробуйте ще раз.");
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        {isSubmitting ? "Виходимо..." : "Вийти"}
      </Button>
      {error ? (
        <p className={styles.error} role="alert" aria-live="polite">
          {error}
        </p>
      ) : null}
    </>
  );
}

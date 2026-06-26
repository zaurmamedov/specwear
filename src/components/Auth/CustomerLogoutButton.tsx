"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";

type CustomerLogoutButtonProps = {
  className?: string;
};

export function CustomerLogoutButton({ className }: CustomerLogoutButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <Button
      variant="secondary"
      size="small"
      className={className}
      disabled={isSubmitting}
      onClick={async () => {
        setIsSubmitting(true);

        try {
          await fetch("/api/auth/logout", {
            method: "POST",
          });
        } finally {
          router.push("/login");
          router.refresh();
          setIsSubmitting(false);
        }
      }}
    >
      Вийти
    </Button>
  );
}

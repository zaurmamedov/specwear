"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";

type AdminLogoutButtonProps = {
  className?: string;
};

export function AdminLogoutButton({ className }: AdminLogoutButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    setIsSubmitting(true);

    try {
      await fetch("/api/admin/logout", {
        method: "POST",
      });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="small"
      className={className}
      disabled={isSubmitting}
      onClick={handleLogout}
    >
      {isSubmitting ? "Виходимо..." : "Вийти"}
    </Button>
  );
}

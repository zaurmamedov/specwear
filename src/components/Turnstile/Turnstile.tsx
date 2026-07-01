"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import {
  TURNSTILE_DEV_BYPASS_TOKEN,
  TURNSTILE_LOAD_ERROR_MESSAGE,
} from "@/lib/security/turnstile.shared";

import styles from "./Turnstile.module.css";

type TurnstileStatus = "idle" | "ready" | "verified" | "expired" | "error" | "unsupported" | "dev";

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  action?: string;
  size?: "normal" | "flexible";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  "unsupported-callback"?: () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __specwearTurnstileScriptPromise?: Promise<void>;
  }
}

export type TurnstileHandle = {
  reset: () => void;
};

type TurnstileProps = {
  action?: string;
  className?: string;
  onError?: () => void;
  onExpire?: () => void;
  onUnsupported?: () => void;
  onVerify: (token: string) => void;
};

const TURNSTILE_SCRIPT_ID = "specwear-turnstile-script";

function loadTurnstileScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile can only load in the browser."));
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (window.__specwearTurnstileScriptPromise) {
    return window.__specwearTurnstileScriptPromise;
  }

  window.__specwearTurnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;

    const handleLoaded = () => {
      if (window.turnstile) {
        resolve();
        return;
      }

      reject(new Error("Turnstile script loaded without API object."));
    };

    const handleError = () => {
      reject(new Error("Turnstile script failed to load."));
    };

    if (existingScript) {
      if (existingScript.dataset.loaded === "true" && window.turnstile) {
        resolve();
        return;
      }

      existingScript.addEventListener("load", handleLoaded, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        handleLoaded();
      },
      { once: true }
    );
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    window.__specwearTurnstileScriptPromise = undefined;
    throw error;
  });

  return window.__specwearTurnstileScriptPromise;
}

export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  {
    action = "submit",
    className,
    onError,
    onExpire,
    onUnsupported,
    onVerify,
  },
  ref
) {
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  const onUnsupportedRef = useRef(onUnsupported);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
  const isDevelopment = process.env.NODE_ENV !== "production";
  const isDevBypassMode = isDevelopment && !siteKey;
  const [status, setStatus] = useState<TurnstileStatus>(isDevBypassMode ? "dev" : "idle");
  const [message, setMessage] = useState<string | null>(
    isDevBypassMode
      ? "NEXT_PUBLIC_TURNSTILE_SITE_KEY відсутній у development. Перевірка ботів тимчасово обходиться лише локально."
      : null
  );

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
    onUnsupportedRef.current = onUnsupported;
  }, [onError, onExpire, onUnsupported, onVerify]);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        if (isDevBypassMode) {
          setStatus("dev");
          setMessage(
            "NEXT_PUBLIC_TURNSTILE_SITE_KEY відсутній у development. Перевірка ботів тимчасово обходиться лише локально."
          );
          onVerifyRef.current(TURNSTILE_DEV_BYPASS_TOKEN);
          return;
        }

        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          setStatus("ready");
          setMessage(null);
        }
      },
    }),
    [isDevBypassMode]
  );

  useEffect(() => {
    if (isDevBypassMode) {
      onVerifyRef.current(TURNSTILE_DEV_BYPASS_TOKEN);
      return;
    }

    if (!siteKey) {
      setStatus("unsupported");
      setMessage(TURNSTILE_LOAD_ERROR_MESSAGE);
      onUnsupportedRef.current?.();
      return;
    }

    let isCancelled = false;

    void loadTurnstileScript()
      .then(() => {
        if (isCancelled || !widgetContainerRef.current || !window.turnstile || widgetIdRef.current) {
          return;
        }

        widgetIdRef.current = window.turnstile.render(widgetContainerRef.current, {
          sitekey: siteKey,
          action,
          theme: "light",
          size: "flexible",
          callback(token) {
            if (isCancelled) {
              return;
            }

            setStatus("verified");
            setMessage(null);
            onVerifyRef.current(token);
          },
          "expired-callback": () => {
            if (isCancelled) {
              return;
            }

            setStatus("expired");
            setMessage(null);
            onExpireRef.current?.();
          },
          "error-callback": () => {
            if (isCancelled) {
              return;
            }

            setStatus("error");
            setMessage(TURNSTILE_LOAD_ERROR_MESSAGE);
            onErrorRef.current?.();
          },
          "unsupported-callback": () => {
            if (isCancelled) {
              return;
            }

            setStatus("unsupported");
            setMessage(TURNSTILE_LOAD_ERROR_MESSAGE);
            onUnsupportedRef.current?.();
          },
        });

        setStatus("ready");
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setStatus("error");
        setMessage(TURNSTILE_LOAD_ERROR_MESSAGE);
        onErrorRef.current?.();
      });

    return () => {
      isCancelled = true;

      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [action, isDevBypassMode, siteKey]);

  const rootClassName = useMemo(
    () => [styles.root, className].filter(Boolean).join(" "),
    [className]
  );

  return (
    <div className={rootClassName}>
      <div className={styles.widgetShell}>
        <div ref={widgetContainerRef} className={styles.widget} data-status={status} />
      </div>
      {message ? (
        <p
          className={`${styles.message} ${
            status === "dev" ? styles.warning : styles.error
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
});

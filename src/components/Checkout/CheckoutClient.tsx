"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/Button";
import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";
import { isSupabaseStorageUrl } from "@/lib/images";
import {
  TURNSTILE_EXPIRED_MESSAGE,
  TURNSTILE_LOAD_ERROR_MESSAGE,
  TURNSTILE_REQUIRED_MESSAGE,
} from "@/lib/security/turnstile.shared";
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
  deliveryCityRef: string | null;
  deliveryWarehouse: string;
  deliveryWarehouseRef: string | null;
  deliveryAddress: string;
  comment: string;
};

type CheckoutFieldName =
  | "firstName"
  | "lastName"
  | "phone"
  | "email"
  | "deliveryCity"
  | "deliveryWarehouse"
  | "deliveryAddress";

type CheckoutFieldErrors = Record<CheckoutFieldName, string | null>;
type CheckoutTouchedState = Record<CheckoutFieldName, boolean>;

type NovaPoshtaCity = {
  ref: string;
  name: string;
  area: string | null;
};

type NovaPoshtaWarehouse = {
  ref: string;
  name: string;
  address: string;
  type: string;
};

type CartAvailabilityResult = {
  productId: string;
  variantId: string | null;
  isAvailable: boolean;
  message: string | null;
};

type PersistedCheckoutAttempt = {
  key: string;
  signature: string;
};

const CHECKOUT_ATTEMPT_STORAGE_KEY = "specwear-checkout-attempt";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CheckoutProfileData = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  customerType: CustomerType;
  deliveryService: DeliveryService;
  deliveryMethod: DeliveryMethod;
  deliveryCity: string;
  deliveryCityRef: string | null;
  deliveryWarehouse: string;
  deliveryWarehouseRef: string | null;
  deliveryAddress: string;
};

const initialFormState: CheckoutFormState = {
  firstName: "",
  lastName: "",
  phone: "+380",
  email: "",
  customerType: "retail",
  deliveryService: "nova_poshta",
  deliveryMethod: "branch",
  deliveryCity: "",
  deliveryCityRef: null,
  deliveryWarehouse: "",
  deliveryWarehouseRef: null,
  deliveryAddress: "",
  comment: "",
};

function createInitialFormState(profile?: CheckoutProfileData | null): CheckoutFormState {
  if (!profile) {
    return initialFormState;
  }

  return {
    ...initialFormState,
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
    phone: profile.phone || "+380",
    email: profile.email || "",
    customerType: profile.customerType || "retail",
    deliveryService: profile.deliveryService || "nova_poshta",
    deliveryMethod: profile.deliveryMethod || "branch",
    deliveryCity: profile.deliveryCity || "",
    deliveryCityRef: profile.deliveryCityRef ?? null,
    deliveryWarehouse: profile.deliveryWarehouse || "",
    deliveryWarehouseRef: profile.deliveryWarehouseRef ?? null,
    deliveryAddress: profile.deliveryAddress || "",
  };
}

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

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function createCheckoutAttemptSignature(value: unknown) {
  const serialized = JSON.stringify(value);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized)
  );

  return bytesToHex(digest);
}

function readPersistedCheckoutAttempt(): PersistedCheckoutAttempt | null {
  try {
    const storedValue = localStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY);

    if (!storedValue) {
      return null;
    }

    const parsed = JSON.parse(storedValue) as Partial<PersistedCheckoutAttempt>;

    if (
      typeof parsed.key !== "string" ||
      !UUID_PATTERN.test(parsed.key) ||
      typeof parsed.signature !== "string" ||
      !/^[0-9a-f]{64}$/.test(parsed.signature)
    ) {
      return null;
    }

    return {
      key: parsed.key,
      signature: parsed.signature,
    };
  } catch {
    return null;
  }
}

function persistCheckoutAttempt(attempt: PersistedCheckoutAttempt) {
  try {
    localStorage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
  } catch {
    // The in-memory ref still provides protection for the current page lifetime.
  }
}

function removePersistedCheckoutAttempt(key: string) {
  try {
    const current = readPersistedCheckoutAttempt();

    if (current?.key === key) {
      localStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
    }
  } catch {
    // Storage cleanup is best effort after an authoritative result.
  }
}

type CheckoutClientProps = {
  developmentWarning?: string | null;
  initialProfile?: CheckoutProfileData | null;
  isAuthenticated?: boolean;
};

export function CheckoutClient({
  developmentWarning = null,
  initialProfile = null,
  isAuthenticated = false,
}: CheckoutClientProps) {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);

  const [form, setForm] = useState<CheckoutFormState>(() =>
    createInitialFormState(initialProfile)
  );
  const [cityQuery, setCityQuery] = useState(initialProfile?.deliveryCity ?? "");
  const [warehouseQuery, setWarehouseQuery] = useState(
    initialProfile?.deliveryWarehouse ?? ""
  );
  const [citySuggestions, setCitySuggestions] = useState<NovaPoshtaCity[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<NovaPoshtaWarehouse[]>([]);
  const [isCitySuggestionsOpen, setIsCitySuggestionsOpen] = useState(false);
  const [isWarehouseSuggestionsOpen, setIsWarehouseSuggestionsOpen] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);
  const [citySearchError, setCitySearchError] = useState<string | null>(null);
  const [warehouseSearchError, setWarehouseSearchError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [cartAvailability, setCartAvailability] = useState<CartAvailabilityResult[]>([]);
  const [touched, setTouched] = useState<CheckoutTouchedState>({
    firstName: false,
    lastName: false,
    phone: false,
    email: false,
    deliveryCity: false,
    deliveryWarehouse: false,
    deliveryAddress: false,
  });
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const deliveryCityRef = useRef<HTMLInputElement>(null);
  const deliveryWarehouseRef = useRef<HTMLSelectElement | HTMLInputElement>(null);
  const deliveryAddressRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const submissionLockRef = useRef(false);
  const checkoutAttemptRef = useRef<PersistedCheckoutAttempt | null>(null);

  const subtotal = useMemo(
    () => items.reduce((total, item) => total + (item.price ?? 0) * item.quantity, 0),
    [items]
  );
  const deliveryPrice = 0;
  const total = subtotal + deliveryPrice;
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);
  const effectiveCartAvailability = items.length === 0 ? [] : cartAvailability;
  const hasUnavailableCartItems = effectiveCartAvailability.some(
    (item) => !item.isAvailable
  );
  const cartAvailabilityMessage =
    effectiveCartAvailability.find((item) => !item.isAvailable)?.message ??
    (hasUnavailableCartItems
      ? "Деякі товари більше недоступні для замовлення."
      : null);

  const currentMethodOptions = deliveryMethodOptions[form.deliveryService];
  const isNovaPoshta = form.deliveryService === "nova_poshta";
  const isCourier = form.deliveryMethod === "courier";
  const needsWarehouseInput =
    form.deliveryMethod === "branch" ||
    form.deliveryMethod === "locker";
  const needsPickupPoint = form.deliveryMethod === "pickup";
  const needsWarehouseSelection = needsWarehouseInput || needsPickupPoint;
  const usesNovaPoshtaWarehouses = isNovaPoshta && needsWarehouseInput;
  const warehouseInputPlaceholder =
    form.deliveryMethod === "locker"
      ? "Введіть номер або адресу поштомату"
      : "Введіть номер або адресу відділення";

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/cart/availability", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId ?? null,
              quantity: item.quantity,
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { items?: CartAvailabilityResult[] };

        if (!controller.signal.aborted) {
          setCartAvailability(Array.isArray(payload.items) ? payload.items : []);
        }
      } catch {
        if (!controller.signal.aborted) {
          setCartAvailability([]);
        }
      }
    })();

    return () => controller.abort();
  }, [items]);

  useEffect(() => {
    if (!isNovaPoshta) {
      return;
    }

    if (form.deliveryCityRef && cityQuery.trim() === form.deliveryCity.trim()) {
      return;
    }

    const query = cityQuery.trim();

    if (query.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoadingCities(true);
      setCitySearchError(null);

      try {
        const response = await fetch(
          `/api/nova-poshta/cities?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Не вдалося завантажити список міст.");
        }

        const cities = (await response.json()) as NovaPoshtaCity[];
        setCitySuggestions(cities);
        setIsCitySuggestionsOpen(true);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setCitySuggestions([]);
        setCitySearchError(
          error instanceof Error
            ? error.message
            : "Не вдалося завантажити список міст."
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingCities(false);
        }
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [cityQuery, form.deliveryCity, form.deliveryCityRef, isNovaPoshta]);

  useEffect(() => {
    if (!usesNovaPoshtaWarehouses || !form.deliveryCityRef) {
      return;
    }

    const controller = new AbortController();
    const cityRef = form.deliveryCityRef;
    const warehouseType =
      form.deliveryMethod === "locker" ? "parcel_locker" : "branch";
    const query = warehouseQuery.trim();

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setIsLoadingWarehouses(true);
        setWarehouseSearchError(null);

        try {
          const params = new URLSearchParams({
            cityRef,
            type: warehouseType,
          });

          if (query.length >= 2) {
            params.set("q", query);
          }

          const response = await fetch(`/api/nova-poshta/warehouses?${params.toString()}`, {
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(
              form.deliveryMethod === "locker"
                ? "Не вдалося завантажити список поштоматів."
                : "Не вдалося завантажити список відділень."
            );
          }

          const warehouses = (await response.json()) as NovaPoshtaWarehouse[];
          setWarehouseOptions(warehouses);
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }

          setWarehouseOptions([]);
          setWarehouseSearchError(
            error instanceof Error
              ? error.message
              : form.deliveryMethod === "locker"
                ? "Не вдалося завантажити список поштоматів."
                : "Не вдалося завантажити список відділень."
          );
        } finally {
          if (!controller.signal.aborted) {
            setIsLoadingWarehouses(false);
          }
        }
      })();
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    form.deliveryCityRef,
    form.deliveryMethod,
    usesNovaPoshtaWarehouses,
    warehouseQuery,
  ]);

  const validationErrors: CheckoutFieldErrors = {
    firstName: form.firstName.trim() === "" ? "Введіть ім'я" : null,
    lastName: form.lastName.trim() === "" ? "Введіть прізвище" : null,
    phone: validatePhone(form.phone) ? null : "Введіть коректний номер телефону",
    email: validateEmail(form.email) ? null : "Введіть коректний email",
    deliveryCity:
      form.deliveryCity.trim() === "" ||
      (isNovaPoshta && form.deliveryCityRef === null)
        ? "Вкажіть місто доставки"
        : null,
    deliveryWarehouse: needsWarehouseInput
      ? usesNovaPoshtaWarehouses
        ? form.deliveryCityRef === null
          ? null
          : form.deliveryWarehouseRef === null
            ? `Оберіть ${getMethodFieldLabel(form.deliveryMethod).toLowerCase()} зі списку`
            : null
        : form.deliveryWarehouse.trim() === ""
          ? `${getMethodFieldLabel(form.deliveryMethod)} є обов'язковим`
          : null
      : null,
    deliveryAddress:
      isCourier && form.deliveryAddress.trim() === "" ? "Вкажіть адресу доставки" : null,
  };

  const isFormValid = Object.values(validationErrors).every((value) => value === null);
  const canSubmit =
    items.length > 0 &&
    isFormValid &&
    !isSubmitting &&
    !hasUnavailableCartItems &&
    Boolean(turnstileToken);

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
      ref: RefObject<HTMLInputElement | HTMLSelectElement | null>;
    }> = [
      { name: "firstName", ref: firstNameRef },
      { name: "lastName", ref: lastNameRef },
      { name: "phone", ref: phoneRef },
      { name: "email", ref: emailRef },
      { name: "deliveryCity", ref: deliveryCityRef },
      { name: "deliveryWarehouse", ref: deliveryWarehouseRef },
      { name: "deliveryAddress", ref: deliveryAddressRef },
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
      deliveryCityRef: nextService === "nova_poshta" ? current.deliveryCityRef : null,
      deliveryWarehouse: "",
      deliveryWarehouseRef: null,
      deliveryAddress: "",
    }));

    if (nextService !== "nova_poshta") {
      setCityQuery("");
      setCitySuggestions([]);
      setIsCitySuggestionsOpen(false);
      setIsLoadingCities(false);
      setCitySearchError(null);
      setWarehouseOptions([]);
      setWarehouseQuery("");
      setIsWarehouseSuggestionsOpen(false);
      setIsLoadingWarehouses(false);
      setWarehouseSearchError(null);
      return;
    }

    setCityQuery(form.deliveryCity);
  }

  function handleMethodChange(event: ChangeEvent<HTMLInputElement>) {
    const nextMethod = event.target.value as DeliveryMethod;

    setForm((current) => ({
      ...current,
      deliveryMethod: nextMethod,
      deliveryWarehouse: "",
      deliveryWarehouseRef: null,
      deliveryAddress: nextMethod === "courier" ? current.deliveryAddress : "",
    }));

    setWarehouseQuery("");
    setWarehouseOptions([]);
    setIsWarehouseSuggestionsOpen(false);
    setWarehouseSearchError(null);

    if (nextMethod === "courier") {
      setIsLoadingWarehouses(false);
    }
  }

  function handleNovaPoshtaCityInput(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;

    setCityQuery(value);
    setIsCitySuggestionsOpen(true);
    setIsLoadingCities(false);
    setCitySearchError(null);
    if (value.trim().length < 2) {
      setCitySuggestions([]);
      setIsCitySuggestionsOpen(false);
    }
    setWarehouseOptions([]);
    setWarehouseQuery("");
    setIsWarehouseSuggestionsOpen(false);
    setWarehouseSearchError(null);

    setForm((current) => ({
      ...current,
      deliveryCity: value,
      deliveryCityRef: null,
      deliveryWarehouse: "",
      deliveryWarehouseRef: null,
    }));
  }

  function selectCity(city: NovaPoshtaCity) {
    const cityLabel = city.area ? `${city.name}, ${city.area}` : city.name;

    setCityQuery(cityLabel);
    setCitySuggestions([]);
    setIsCitySuggestionsOpen(false);
    setIsLoadingCities(false);
    setCitySearchError(null);
    setWarehouseOptions([]);
    setWarehouseQuery("");
    setIsWarehouseSuggestionsOpen(false);
    setWarehouseSearchError(null);
    setForm((current) => ({
      ...current,
      deliveryCity: cityLabel,
      deliveryCityRef: city.ref,
      deliveryWarehouse: "",
      deliveryWarehouseRef: null,
    }));
    markFieldTouched("deliveryCity");
  }

  function handleNovaPoshtaWarehouseInput(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;

    setWarehouseQuery(value);
    setWarehouseSearchError(null);
    setIsWarehouseSuggestionsOpen(Boolean(form.deliveryCityRef));

    setForm((current) => ({
      ...current,
      deliveryWarehouse: value,
      deliveryWarehouseRef: null,
    }));
  }

  function selectWarehouse(warehouse: NovaPoshtaWarehouse) {
    const warehouseLabel = warehouse.name || warehouse.address;

    setWarehouseQuery(warehouseLabel);
    setIsWarehouseSuggestionsOpen(false);
    setWarehouseSearchError(null);
    setForm((current) => ({
      ...current,
      deliveryWarehouse: warehouseLabel,
      deliveryWarehouseRef: warehouse.ref,
    }));
    markFieldTouched("deliveryWarehouse");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submissionLockRef.current) {
      return;
    }

    if (!canSubmit) {
      if (!turnstileToken) {
        setSubmitError(TURNSTILE_REQUIRED_MESSAGE);
      }

      setTouched({
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        deliveryCity: true,
        deliveryWarehouse: true,
        deliveryAddress: true,
      });
      focusFirstInvalidField(validationErrors);
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    let completedSuccessfully = false;

    try {
      const semanticPayload = {
        authenticated: isAuthenticated,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        deliveryService: form.deliveryService,
        deliveryMethod: form.deliveryMethod,
        deliveryCity: form.deliveryCity.trim(),
        deliveryCityRef: form.deliveryCityRef,
        deliveryWarehouse: needsWarehouseSelection ? form.deliveryWarehouse.trim() || null : null,
        deliveryWarehouseRef: form.deliveryWarehouseRef,
        deliveryAddress: isCourier ? form.deliveryAddress.trim() || null : null,
        comment: form.comment.trim() || null,
        items: items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? null,
          quantity: item.quantity,
        })),
      };
      semanticPayload.items.sort((left, right) => {
        const productComparison = left.productId.localeCompare(right.productId);

        if (productComparison !== 0) {
          return productComparison;
        }

        return (left.variantId ?? "").localeCompare(right.variantId ?? "");
      });
      const signature = await createCheckoutAttemptSignature(semanticPayload);
      const persistedAttempt = readPersistedCheckoutAttempt();
      const cachedAttempt = checkoutAttemptRef.current;
      const reusableAttempt =
        persistedAttempt?.signature === signature
          ? persistedAttempt
          : cachedAttempt?.signature === signature
            ? cachedAttempt
            : null;
      const checkoutAttempt = reusableAttempt ?? {
        key: crypto.randomUUID(),
        signature,
      };

      checkoutAttemptRef.current = checkoutAttempt;
      persistCheckoutAttempt(checkoutAttempt);

      const { authenticated: _authenticated, ...checkoutPayload } = semanticPayload;
      void _authenticated;
      const orderPayload = {
        ...checkoutPayload,
        turnstileToken,
      };

      const response = await fetch("/api/checkout/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": checkoutAttempt.key,
        },
        body: JSON.stringify(orderPayload),
      });

      const payload = (await response.json()) as {
        error?: string;
        orderId?: string;
        subtotal?: number;
        deliveryPrice?: number;
        discount?: number;
        total?: number;
        code?: string;
      };

      if (
        !response.ok ||
        !payload.orderId ||
        !Number.isSafeInteger(payload.subtotal) ||
        !Number.isSafeInteger(payload.deliveryPrice) ||
        !Number.isSafeInteger(payload.discount) ||
        !Number.isSafeInteger(payload.total)
      ) {
        if (
          response.status === 409 &&
          payload.code === "CHECKOUT_IDEMPOTENCY_CONFLICT"
        ) {
          removePersistedCheckoutAttempt(checkoutAttempt.key);
          checkoutAttemptRef.current = null;
        }

        throw new Error(payload.error ?? "Не вдалося створити замовлення.");
      }

      completedSuccessfully = true;
      removePersistedCheckoutAttempt(checkoutAttempt.key);
      checkoutAttemptRef.current = null;
      clearCart();
      router.replace(`/checkout/success?order=${payload.orderId}`);
    } catch (error) {
      setTurnstileToken(null);
      turnstileRef.current?.reset();
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Не вдалося оформити замовлення."
      );
    } finally {
      submissionLockRef.current = false;

      if (!completedSuccessfully) {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <div className={styles.layout}>
      <form className={styles.form} onSubmit={handleSubmit}>
        {!isAuthenticated ? (
          <section className={`${styles.section} ${styles.checkoutNote}`}>
            <p className={styles.helper}>
              <Link href="/login?redirectTo=/checkout">Увійдіть</Link>, щоб зберегти
              дані та бачити історію замовлень.
            </p>
          </section>
        ) : null}

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
            {isNovaPoshta ? (
              <label className={styles.field}>
                <span>Місто *</span>
                <div className={styles.autocomplete}>
                  <input
                    type="text"
                    name="deliveryCity"
                    value={cityQuery}
                    ref={deliveryCityRef}
                    onChange={handleNovaPoshtaCityInput}
                    onBlur={(event) => {
                      handleFieldBlur(event);
                      window.setTimeout(() => setIsCitySuggestionsOpen(false), 120);
                    }}
                    onFocus={() => {
                      if (citySuggestions.length > 0 || isLoadingCities) {
                        setIsCitySuggestionsOpen(true);
                      }
                    }}
                    placeholder="Почніть вводити місто"
                    aria-invalid={validationErrors.deliveryCity !== null}
                    autoComplete="off"
                    required
                  />

                  {isCitySuggestionsOpen ? (
                    <div className={styles.autocompletePanel}>
                      {isLoadingCities ? (
                        <p className={styles.autocompleteState}>Шукаємо міста...</p>
                      ) : citySearchError ? (
                        <p className={styles.autocompleteState}>{citySearchError}</p>
                      ) : cityQuery.trim().length >= 2 && citySuggestions.length === 0 ? (
                        <p className={styles.autocompleteState}>Місто не знайдено</p>
                      ) : (
                        citySuggestions.map((city) => (
                          <button
                            key={city.ref}
                            type="button"
                            className={styles.autocompleteOption}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectCity(city)}
                          >
                            <span>{city.name}</span>
                            {city.area ? (
                              <span className={styles.autocompleteMeta}>{city.area}</span>
                            ) : null}
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
                {touched.deliveryCity && validationErrors.deliveryCity ? (
                  <span className={styles.fieldError}>{validationErrors.deliveryCity}</span>
                ) : null}
              </label>
            ) : (
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
            )}

            {usesNovaPoshtaWarehouses ? (
              <label className={styles.field}>
                <span>{getMethodFieldLabel(form.deliveryMethod)} *</span>
                <div className={styles.autocomplete}>
                  <input
                    type="text"
                    name="deliveryWarehouse"
                    value={warehouseQuery}
                    ref={deliveryWarehouseRef as RefObject<HTMLInputElement>}
                    onChange={handleNovaPoshtaWarehouseInput}
                    onBlur={() => {
                      markFieldTouched("deliveryWarehouse");
                      window.setTimeout(
                        () => setIsWarehouseSuggestionsOpen(false),
                        120
                      );
                    }}
                    onFocus={() => {
                      if (form.deliveryCityRef) {
                        setIsWarehouseSuggestionsOpen(true);
                      }
                    }}
                    placeholder={warehouseInputPlaceholder}
                    aria-invalid={validationErrors.deliveryWarehouse !== null}
                    autoComplete="off"
                    disabled={!form.deliveryCityRef}
                    required
                  />

                  {isWarehouseSuggestionsOpen ? (
                    <div className={styles.autocompletePanel}>
                      {!form.deliveryCityRef ? (
                        <p className={styles.autocompleteState}>Спочатку оберіть місто</p>
                      ) : isLoadingWarehouses ? (
                        <p className={styles.autocompleteState}>
                          {form.deliveryMethod === "locker"
                            ? "Завантажуємо поштомати..."
                            : "Завантажуємо відділення..."}
                        </p>
                      ) : warehouseSearchError ? (
                        <p className={styles.autocompleteState}>{warehouseSearchError}</p>
                      ) : warehouseOptions.length === 0 ? (
                        <p className={styles.autocompleteState}>
                          {form.deliveryMethod === "locker"
                            ? "Поштомати не знайдено"
                            : "Відділення не знайдено"}
                        </p>
                      ) : (
                        warehouseOptions.map((warehouse) => (
                          <button
                            key={warehouse.ref}
                            type="button"
                            className={styles.autocompleteOption}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectWarehouse(warehouse)}
                          >
                            <span>{warehouse.name}</span>
                            {warehouse.address ? (
                              <span className={styles.autocompleteMeta}>
                                {warehouse.address}
                              </span>
                            ) : null}
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
                {warehouseSearchError ? (
                  <span className={styles.fieldError}>{warehouseSearchError}</span>
                ) : null}
                {touched.deliveryWarehouse && validationErrors.deliveryWarehouse ? (
                  <span className={styles.fieldError}>{validationErrors.deliveryWarehouse}</span>
                ) : null}
              </label>
            ) : null}

            {!isNovaPoshta && needsWarehouseSelection ? (
              <label className={styles.field}>
                <span>{getMethodFieldLabel(form.deliveryMethod)}</span>
                <input
                  type="text"
                  name="deliveryWarehouse"
                  value={form.deliveryWarehouse}
                  ref={deliveryWarehouseRef as RefObject<HTMLInputElement>}
                  onChange={(event) => updateField("deliveryWarehouse", event.target.value)}
                  onBlur={() => markFieldTouched("deliveryWarehouse")}
                  aria-invalid={validationErrors.deliveryWarehouse !== null}
                />
                {touched.deliveryWarehouse && validationErrors.deliveryWarehouse ? (
                  <span className={styles.fieldError}>{validationErrors.deliveryWarehouse}</span>
                ) : null}
              </label>
            ) : null}

            {isCourier ? (
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span>Адреса *</span>
                <input
                  type="text"
                  name="deliveryAddress"
                  value={form.deliveryAddress}
                  ref={deliveryAddressRef}
                  onChange={(event) => updateField("deliveryAddress", event.target.value)}
                  onBlur={() => markFieldTouched("deliveryAddress")}
                  aria-invalid={validationErrors.deliveryAddress !== null}
                />
                {touched.deliveryAddress && validationErrors.deliveryAddress ? (
                  <span className={styles.fieldError}>{validationErrors.deliveryAddress}</span>
                ) : null}
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
        {cartAvailabilityMessage ? (
          <p className={styles.error}>{cartAvailabilityMessage}</p>
        ) : null}

        <div className={styles.submitRow}>
          {developmentWarning ? <p className={styles.warning}>{developmentWarning}</p> : null}
          <Turnstile
            ref={turnstileRef}
            onVerify={(token) => {
              setTurnstileToken(token);
              setSubmitError((current) =>
                current === TURNSTILE_REQUIRED_MESSAGE ||
                current === TURNSTILE_EXPIRED_MESSAGE ||
                current === TURNSTILE_LOAD_ERROR_MESSAGE
                  ? null
                  : current
              );
            }}
            onExpire={() => {
              setTurnstileToken(null);
              setSubmitError(TURNSTILE_EXPIRED_MESSAGE);
            }}
            onError={() => {
              setTurnstileToken(null);
              setSubmitError(TURNSTILE_LOAD_ERROR_MESSAGE);
            }}
            onUnsupported={() => {
              setTurnstileToken(null);
              setSubmitError(TURNSTILE_LOAD_ERROR_MESSAGE);
            }}
          />
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
          {hasUnavailableCartItems ? (
            <p className={styles.helper}>
              Оновіть кошик: частина товарів більше недоступна для замовлення.
            </p>
          ) : null}
          {!turnstileToken ? (
            <p className={styles.helper}>Підтвердьте перевірку безпеки перед оформленням.</p>
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

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
import {
  type CheckoutClientFieldErrors,
  type CheckoutClientFieldName,
  getCheckoutClientValidationErrors,
  getFirstInvalidCheckoutField,
  mapCheckoutServerErrorToFields,
} from "@/lib/checkout-client-validation";
import { isSupabaseStorageUrl } from "@/lib/images";
import {
  CHECKOUT_ADDRESS_MAX_LENGTH,
  CHECKOUT_CART_MAX_LINE_QUANTITY,
  CHECKOUT_CART_MAX_RAW_LINES,
  CHECKOUT_CART_MAX_TOTAL_QUANTITY,
  CHECKOUT_CITY_MAX_LENGTH,
  CHECKOUT_COMMENT_MAX_LENGTH,
  CHECKOUT_EMAIL_MAX_LENGTH,
  CHECKOUT_NAME_MAX_LENGTH,
  CHECKOUT_PHONE_MAX_RAW_LENGTH,
  CHECKOUT_WAREHOUSE_MAX_LENGTH,
  normalizeCheckoutEmail,
  normalizeCheckoutName,
  normalizeUkrainianPhone,
} from "@/lib/checkout-validation.shared";
import {
  TURNSTILE_EXPIRED_MESSAGE,
  TURNSTILE_LOAD_ERROR_MESSAGE,
  TURNSTILE_REQUIRED_MESSAGE,
} from "@/lib/security/turnstile.shared";
import { useCartStore } from "@/stores/cart.store";

import styles from "./Checkout.module.css";

type DeliveryService = "nova_poshta" | "ukrposhta" | "pickup";
type DeliveryMethod = "branch" | "locker" | "courier" | "pickup";

type CheckoutFormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  deliveryService: DeliveryService;
  deliveryMethod: DeliveryMethod;
  deliveryCity: string;
  deliveryCityRef: string | null;
  deliveryWarehouse: string;
  deliveryWarehouseRef: string | null;
  deliveryAddress: string;
  comment: string;
};

type CheckoutFieldName = CheckoutClientFieldName;
type CheckoutFieldErrors = CheckoutClientFieldErrors;
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
  deliveryService: "nova_poshta",
  deliveryMethod: "branch",
  deliveryCity: "",
  deliveryCityRef: null,
  deliveryWarehouse: "",
  deliveryWarehouseRef: null,
  deliveryAddress: "",
  comment: "",
};

function isDeliveryService(value: unknown): value is DeliveryService {
  return (
    value === "nova_poshta" || value === "ukrposhta" || value === "pickup"
  );
}

function createInitialFormState(profile?: CheckoutProfileData | null): CheckoutFormState {
  if (!profile) {
    return initialFormState;
  }

  const deliveryService = isDeliveryService(profile.deliveryService)
    ? profile.deliveryService
    : "nova_poshta";
  const supportedMethods = deliveryMethodOptions[deliveryService];
  const deliveryMethod = supportedMethods.some(
    (option) => option.value === profile.deliveryMethod
  )
    ? profile.deliveryMethod
    : supportedMethods[0]?.value ?? "branch";

  return {
    ...initialFormState,
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
    phone: profile.phone || "+380",
    email: profile.email || "",
    deliveryService,
    deliveryMethod,
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

  return "Відділення";
}

const EMPTY_FIELD_ERRORS: CheckoutFieldErrors = {
  firstName: null,
  lastName: null,
  phone: null,
  email: null,
  deliveryCity: null,
  deliveryWarehouse: null,
  deliveryAddress: null,
  comment: null,
};

const UNTOUCHED_FIELDS: CheckoutTouchedState = {
  firstName: false,
  lastName: false,
  phone: false,
  email: false,
  deliveryCity: false,
  deliveryWarehouse: false,
  deliveryAddress: false,
  comment: false,
};

const ALL_FIELDS_TOUCHED: CheckoutTouchedState = {
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  deliveryCity: true,
  deliveryWarehouse: true,
  deliveryAddress: true,
  comment: true,
};

function getFieldErrorId(field: CheckoutFieldName) {
  return `checkout-${field}-error`;
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
  const [touched, setTouched] = useState<CheckoutTouchedState>(UNTOUCHED_FIELDS);
  const [serverFieldErrors, setServerFieldErrors] =
    useState<CheckoutFieldErrors>(EMPTY_FIELD_ERRORS);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const deliveryCityRef = useRef<HTMLInputElement>(null);
  const deliveryWarehouseRef = useRef<HTMLSelectElement | HTMLInputElement>(null);
  const deliveryAddressRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
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
  const cartLimitError =
    items.length > CHECKOUT_CART_MAX_RAW_LINES
      ? `У кошику може бути не більше ${CHECKOUT_CART_MAX_RAW_LINES} позицій.`
      : items.some((item) => item.quantity > CHECKOUT_CART_MAX_LINE_QUANTITY)
        ? `Кількість одного товару не може перевищувати ${CHECKOUT_CART_MAX_LINE_QUANTITY}.`
        : itemCount > CHECKOUT_CART_MAX_TOTAL_QUANTITY
          ? `Загальна кількість товарів не може перевищувати ${CHECKOUT_CART_MAX_TOTAL_QUANTITY}.`
          : null;
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
  const isPickup = form.deliveryService === "pickup";
  const isNovaPoshta = form.deliveryService === "nova_poshta";
  const isCourier = form.deliveryMethod === "courier";
  const needsWarehouseInput =
    form.deliveryMethod === "branch" ||
    form.deliveryMethod === "locker";
  const needsWarehouseSelection = needsWarehouseInput && !isPickup;
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

  const validationErrors = getCheckoutClientValidationErrors(form);
  const fieldErrors = Object.fromEntries(
    Object.keys(validationErrors).map((field) => {
      const fieldName = field as CheckoutFieldName;
      return [fieldName, validationErrors[fieldName] ?? serverFieldErrors[fieldName]];
    })
  ) as CheckoutFieldErrors;
  const isFormValid = Object.values(fieldErrors).every((value) => value === null);
  const canAttemptSubmit =
    items.length > 0 &&
    !isSubmitting &&
    !cartLimitError &&
    !hasUnavailableCartItems;

  function updateField<Key extends keyof CheckoutFormState>(
    key: Key,
    value: CheckoutFormState[Key]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

    if (key in EMPTY_FIELD_ERRORS) {
      setServerFieldErrors((current) => ({
        ...current,
        [key]: null,
      }));
    }
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
    const firstInvalid = getFirstInvalidCheckoutField(errors);
    const refs: Record<
      CheckoutFieldName,
      RefObject<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>
    > = {
      firstName: firstNameRef,
      lastName: lastNameRef,
      phone: phoneRef,
      email: emailRef,
      deliveryCity: deliveryCityRef,
      deliveryWarehouse: deliveryWarehouseRef,
      deliveryAddress: deliveryAddressRef,
      comment: commentRef,
    };
    const control = firstInvalid ? refs[firstInvalid].current : null;

    if (!control) {
      return;
    }

    window.requestAnimationFrame(() => {
      control.scrollIntoView({ behavior: "smooth", block: "start" });
      control.focus({ preventScroll: true });
    });
  }

  function renderFieldError(
    field: CheckoutFieldName,
    fallbackError: string | null = null
  ) {
    const error = touched[field] ? fieldErrors[field] ?? fallbackError : fallbackError;

    return (
      <span className={styles.fieldMessage} aria-live="polite">
        {error ? (
          <span id={getFieldErrorId(field)} className={styles.fieldError}>
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  function hasVisibleFieldError(field: CheckoutFieldName) {
    return touched[field] && Boolean(fieldErrors[field]);
  }

  function handleServiceChange(event: ChangeEvent<HTMLInputElement>) {
    const nextService = event.target.value as DeliveryService;
    const nextMethod = deliveryMethodOptions[nextService][0]?.value ?? "branch";

    setForm((current) => ({
      ...current,
      deliveryService: nextService,
      deliveryMethod: nextMethod,
      deliveryCity: nextService === "pickup" ? "" : current.deliveryCity,
      deliveryCityRef: nextService === "nova_poshta" ? current.deliveryCityRef : null,
      deliveryWarehouse: "",
      deliveryWarehouseRef: null,
      deliveryAddress: "",
    }));
    setServerFieldErrors((current) => ({
      ...current,
      deliveryCity: null,
      deliveryWarehouse: null,
      deliveryAddress: null,
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
    setServerFieldErrors((current) => ({
      ...current,
      deliveryWarehouse: null,
      deliveryAddress: null,
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
    setServerFieldErrors((current) => ({
      ...current,
      deliveryCity: null,
      deliveryWarehouse: null,
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
    setServerFieldErrors((current) => ({
      ...current,
      deliveryCity: null,
      deliveryWarehouse: null,
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
    setServerFieldErrors((current) => ({
      ...current,
      deliveryWarehouse: null,
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
    setServerFieldErrors((current) => ({
      ...current,
      deliveryWarehouse: null,
    }));
    markFieldTouched("deliveryWarehouse");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submissionLockRef.current) {
      return;
    }

    if (!isFormValid) {
      setSubmitError(null);
      setTouched(ALL_FIELDS_TOUCHED);
      focusFirstInvalidField(fieldErrors);
      return;
    }

    if (!turnstileToken) {
      setSubmitError(TURNSTILE_REQUIRED_MESSAGE);
      return;
    }

    if (!canAttemptSubmit) {
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    let completedSuccessfully = false;

    try {
      const semanticPayload = {
        authenticated: isAuthenticated,
        firstName: normalizeCheckoutName(form.firstName),
        lastName: normalizeCheckoutName(form.lastName),
        phone: normalizeUkrainianPhone(form.phone) ?? form.phone.trim(),
        email: normalizeCheckoutEmail(form.email) ?? "",
        deliveryService: form.deliveryService,
        deliveryMethod: form.deliveryMethod,
        deliveryCity: isPickup ? null : form.deliveryCity.trim(),
        deliveryCityRef: isPickup ? null : form.deliveryCityRef,
        deliveryWarehouse:
          !isPickup && needsWarehouseSelection
            ? form.deliveryWarehouse.trim() || null
            : null,
        deliveryWarehouseRef: isPickup ? null : form.deliveryWarehouseRef,
        deliveryAddress:
          !isPickup && isCourier ? form.deliveryAddress.trim() || null : null,
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

        const mappedErrors = mapCheckoutServerErrorToFields(
          payload.code,
          payload.error,
          form
        );
        const mappedFields = Object.keys(mappedErrors) as CheckoutFieldName[];

        if (mappedFields.length > 0) {
          const nextErrors = {
            ...fieldErrors,
            ...mappedErrors,
          } as CheckoutFieldErrors;

          setServerFieldErrors((current) => ({ ...current, ...mappedErrors }));
          setTouched((current) => {
            const next = { ...current };
            for (const field of mappedFields) {
              next[field] = true;
            }
            return next;
          });
          setTurnstileToken(null);
          turnstileRef.current?.reset();
          setSubmitError(null);
          focusFirstInvalidField(nextErrors);
          return;
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
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
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
                aria-invalid={hasVisibleFieldError("firstName")}
                aria-describedby={
                  hasVisibleFieldError("firstName")
                    ? getFieldErrorId("firstName")
                    : undefined
                }
                maxLength={CHECKOUT_NAME_MAX_LENGTH}
                required
              />
              {renderFieldError("firstName")}
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
                aria-invalid={hasVisibleFieldError("lastName")}
                aria-describedby={
                  hasVisibleFieldError("lastName")
                    ? getFieldErrorId("lastName")
                    : undefined
                }
                maxLength={CHECKOUT_NAME_MAX_LENGTH}
                required
              />
              {renderFieldError("lastName")}
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
                aria-invalid={hasVisibleFieldError("phone")}
                aria-describedby={
                  hasVisibleFieldError("phone") ? getFieldErrorId("phone") : undefined
                }
                maxLength={CHECKOUT_PHONE_MAX_RAW_LENGTH}
                required
              />
              {renderFieldError("phone")}
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
                aria-invalid={hasVisibleFieldError("email")}
                aria-describedby={
                  hasVisibleFieldError("email") ? getFieldErrorId("email") : undefined
                }
                maxLength={CHECKOUT_EMAIL_MAX_LENGTH}
              />
              {renderFieldError("email")}
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

          {!isPickup ? (
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
          ) : null}
        </section>

        {!isPickup ? (
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
                    aria-invalid={hasVisibleFieldError("deliveryCity")}
                    aria-describedby={
                      hasVisibleFieldError("deliveryCity")
                        ? getFieldErrorId("deliveryCity")
                        : undefined
                    }
                    maxLength={CHECKOUT_CITY_MAX_LENGTH}
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
                {renderFieldError("deliveryCity")}
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
                  aria-invalid={hasVisibleFieldError("deliveryCity")}
                  aria-describedby={
                    hasVisibleFieldError("deliveryCity")
                      ? getFieldErrorId("deliveryCity")
                      : undefined
                  }
                  maxLength={CHECKOUT_CITY_MAX_LENGTH}
                  required
                />
                {renderFieldError("deliveryCity")}
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
                    aria-invalid={hasVisibleFieldError("deliveryWarehouse")}
                    aria-describedby={
                      hasVisibleFieldError("deliveryWarehouse") || warehouseSearchError
                        ? getFieldErrorId("deliveryWarehouse")
                        : undefined
                    }
                    maxLength={CHECKOUT_WAREHOUSE_MAX_LENGTH}
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
                {renderFieldError("deliveryWarehouse", warehouseSearchError)}
              </label>
            ) : null}

            {!isNovaPoshta && needsWarehouseSelection ? (
              <label className={styles.field}>
                <span>{getMethodFieldLabel(form.deliveryMethod)} *</span>
                <input
                  type="text"
                  name="deliveryWarehouse"
                  value={form.deliveryWarehouse}
                  ref={deliveryWarehouseRef as RefObject<HTMLInputElement>}
                  onChange={(event) => updateField("deliveryWarehouse", event.target.value)}
                  onBlur={() => markFieldTouched("deliveryWarehouse")}
                  aria-invalid={hasVisibleFieldError("deliveryWarehouse")}
                  aria-describedby={
                    hasVisibleFieldError("deliveryWarehouse")
                      ? getFieldErrorId("deliveryWarehouse")
                      : undefined
                  }
                  maxLength={CHECKOUT_WAREHOUSE_MAX_LENGTH}
                  required
                />
                {renderFieldError("deliveryWarehouse")}
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
                  aria-invalid={hasVisibleFieldError("deliveryAddress")}
                  aria-describedby={
                    hasVisibleFieldError("deliveryAddress")
                      ? getFieldErrorId("deliveryAddress")
                      : undefined
                  }
                  maxLength={CHECKOUT_ADDRESS_MAX_LENGTH}
                  required
                />
                {renderFieldError("deliveryAddress")}
              </label>
            ) : null}

          </div>
        </section>
        ) : null}

        <section className={styles.section}>
          <label className={styles.field}>
            <span>Коментар до замовлення</span>
            <textarea
              name="comment"
              rows={4}
              value={form.comment}
              ref={commentRef}
              onChange={(event) => updateField("comment", event.target.value)}
              onBlur={() => markFieldTouched("comment")}
              aria-invalid={hasVisibleFieldError("comment")}
              aria-describedby={
                hasVisibleFieldError("comment") ? getFieldErrorId("comment") : undefined
              }
              maxLength={CHECKOUT_COMMENT_MAX_LENGTH}
            />
            {renderFieldError("comment")}
          </label>
        </section>

        {submitError ? <p className={styles.error}>{submitError}</p> : null}
        {cartAvailabilityMessage ? (
          <p className={styles.error}>{cartAvailabilityMessage}</p>
        ) : null}
        {cartLimitError ? <p className={styles.error}>{cartLimitError}</p> : null}

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
          <Button type="submit" size="large" disabled={!canAttemptSubmit}>
            {isSubmitting ? "Оформляємо..." : "Оформити замовлення"}
          </Button>
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

const NOVA_POSHTA_API_URL = "https://api.novaposhta.ua/v2.0/json/";

export const NOVA_POSHTA_TIMEOUT_MS = 4_000;
export const NOVA_POSHTA_CITY_CACHE_TTL_MS = 5 * 60 * 1_000;
export const NOVA_POSHTA_CITY_NEGATIVE_CACHE_TTL_MS = 30 * 1_000;
export const NOVA_POSHTA_WAREHOUSE_CACHE_TTL_MS = 10 * 60 * 1_000;
export const NOVA_POSHTA_MAX_CONCURRENCY = 8;
export const NOVA_POSHTA_MAX_QUEUE_SIZE = 16;
export const NOVA_POSHTA_MAX_QUEUE_WAIT_MS = 1_000;

const NOVA_POSHTA_CITY_CACHE_MAX_ENTRIES = 100;
const NOVA_POSHTA_WAREHOUSE_CACHE_MAX_ENTRIES = 10;
const NOVA_POSHTA_CITY_IN_FLIGHT_MAX_ENTRIES = 100;
const NOVA_POSHTA_WAREHOUSE_IN_FLIGHT_MAX_ENTRIES = 50;
const NOVA_POSHTA_RAW_WAREHOUSE_LIMIT = 5_000;
export const NOVA_POSHTA_CITY_RESULT_LIMIT = 20;
export const NOVA_POSHTA_WAREHOUSE_RESULT_LIMIT = 50;

export type NovaPoshtaCityRecord = {
  Ref?: string;
  Description?: string;
  Present?: string;
  AreaDescription?: string;
};

export type NovaPoshtaWarehouseRecord = {
  Ref?: string;
  Description?: string;
  DescriptionRu?: string;
  ShortAddress?: string;
  ShortAddressRu?: string;
  TypeOfWarehouse?: string;
  CategoryOfWarehouse?: string;
  Number?: string;
  WarehouseIndex?: string;
  SettlementDescription?: string;
  PlaceMaxWeightAllowed?: string;
};

export type NovaPoshtaWarehouseFilterType = "branch" | "parcel_locker";

function isParcelLocker(record: NovaPoshtaWarehouseRecord) {
  const source = [
    record.Description,
    record.ShortAddress,
    record.TypeOfWarehouse,
    record.CategoryOfWarehouse,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return source.includes("поштомат") || source.includes("postomat");
}

export function toPublicNovaPoshtaCities(records: NovaPoshtaCityRecord[]) {
  return records
    .filter((item) => item.Ref && (item.Description || item.Present))
    .map((item) => ({
      ref: item.Ref as string,
      name: (item.Present ?? item.Description ?? "").trim(),
      area: item.AreaDescription?.trim() || null,
    }))
    .slice(0, NOVA_POSHTA_CITY_RESULT_LIMIT);
}

export function toPublicNovaPoshtaWarehouses(
  records: NovaPoshtaWarehouseRecord[],
  type: NovaPoshtaWarehouseFilterType,
  query: string
) {
  return records
    .filter((item) => item.Ref && (item.ShortAddress || item.Description))
    .filter((item) =>
      type === "parcel_locker" ? isParcelLocker(item) : !isParcelLocker(item)
    )
    .filter((item) => {
      if (!query) {
        return true;
      }

      const haystack = [
        item.Description,
        item.DescriptionRu,
        item.ShortAddress,
        item.ShortAddressRu,
        item.TypeOfWarehouse,
        item.CategoryOfWarehouse,
        item.Number,
        item.WarehouseIndex,
        item.SettlementDescription,
        item.PlaceMaxWeightAllowed,
      ]
        .filter(Boolean)
        .join(" ")
        .normalize("NFC")
        .toLowerCase();

      return haystack.includes(query);
    })
    .map((item) => ({
      ref: item.Ref as string,
      name: (item.Description ?? item.ShortAddress ?? "").trim(),
      address: (item.ShortAddress ?? item.Description ?? "").trim(),
      type,
    }))
    .slice(0, NOVA_POSHTA_WAREHOUSE_RESULT_LIMIT);
}

type NovaPoshtaClientOptions = {
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  maxConcurrency?: number;
  maxQueueSize?: number;
  maxQueueWaitMs?: number;
};

export class NovaPoshtaUnavailableError extends Error {
  constructor() {
    super("Nova Poshta is unavailable.");
    this.name = "NovaPoshtaUnavailableError";
  }
}

class BoundedTtlCache<Value> {
  private readonly entries = new Map<string, { value: Value; expiresAt: number }>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    maxEntries: number,
    now: () => number
  ) {
    this.maxEntries = maxEntries;
    this.now = now;
  }

  get(key: string) {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: Value, ttlMs: number) {
    this.entries.delete(key);

    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;

      if (oldestKey === undefined) {
        break;
      }

      this.entries.delete(oldestKey);
    }

    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
  }
}

class BoundedConcurrencyGate {
  private activeCount = 0;
  private readonly maxConcurrency: number;
  private readonly maxQueueSize: number;
  private readonly maxQueueWaitMs: number;
  private readonly queue: Array<{
    task: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(
    maxConcurrency: number,
    maxQueueSize: number,
    maxQueueWaitMs: number
  ) {
    this.maxConcurrency = maxConcurrency;
    this.maxQueueSize = maxQueueSize;
    this.maxQueueWaitMs = maxQueueWaitMs;
  }

  run<Value>(task: () => Promise<Value>): Promise<Value> {
    if (this.activeCount < this.maxConcurrency) {
      return this.start(task);
    }

    if (this.queue.length >= this.maxQueueSize) {
      return Promise.reject(new NovaPoshtaUnavailableError());
    }

    return new Promise<Value>((resolve, reject) => {
      const queuedTask = {
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId: setTimeout(() => {
          const index = this.queue.indexOf(queuedTask);

          if (index >= 0) {
            this.queue.splice(index, 1);
            reject(new NovaPoshtaUnavailableError());
          }
        }, this.maxQueueWaitMs),
      };

      this.queue.push(queuedTask);
    });
  }

  private start<Value>(task: () => Promise<Value>): Promise<Value> {
    this.activeCount += 1;

    return Promise.resolve()
      .then(task)
      .finally(() => {
        this.activeCount -= 1;
        this.drain();
      });
  }

  private drain() {
    while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const queuedTask = this.queue.shift();

      if (!queuedTask) {
        return;
      }

      clearTimeout(queuedTask.timeoutId);
      void this.start(queuedTask.task).then(queuedTask.resolve, queuedTask.reject);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchNovaPoshtaData<RecordType>(input: {
  apiKey: string;
  modelName: string;
  calledMethod: string;
  methodProperties: Record<string, unknown>;
  fetcher: typeof fetch;
  timeoutMs: number;
  signal?: AbortSignal;
}) {
  const controller = new AbortController();
  const abortFromRequest = () => controller.abort();
  const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs);

  if (input.signal?.aborted) {
    controller.abort();
  } else {
    input.signal?.addEventListener("abort", abortFromRequest, { once: true });
  }

  try {
    const response = await input.fetcher(NOVA_POSHTA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: input.apiKey,
        modelName: input.modelName,
        calledMethod: input.calledMethod,
        methodProperties: input.methodProperties,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new NovaPoshtaUnavailableError();
    }

    const payload = (await response.json()) as unknown;

    if (
      !isRecord(payload) ||
      payload.success !== true ||
      !Array.isArray(payload.data)
    ) {
      throw new NovaPoshtaUnavailableError();
    }

    return payload.data as RecordType[];
  } catch {
    throw new NovaPoshtaUnavailableError();
  } finally {
    clearTimeout(timeoutId);
    input.signal?.removeEventListener("abort", abortFromRequest);
  }
}

export function createNovaPoshtaClient(options: NovaPoshtaClientOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? NOVA_POSHTA_TIMEOUT_MS;
  const gate = new BoundedConcurrencyGate(
    options.maxConcurrency ?? NOVA_POSHTA_MAX_CONCURRENCY,
    options.maxQueueSize ?? NOVA_POSHTA_MAX_QUEUE_SIZE,
    options.maxQueueWaitMs ?? NOVA_POSHTA_MAX_QUEUE_WAIT_MS
  );
  const cityCache = new BoundedTtlCache<NovaPoshtaCityRecord[]>(
    NOVA_POSHTA_CITY_CACHE_MAX_ENTRIES,
    now
  );
  const warehouseCache = new BoundedTtlCache<NovaPoshtaWarehouseRecord[]>(
    NOVA_POSHTA_WAREHOUSE_CACHE_MAX_ENTRIES,
    now
  );
  const cityInFlight = new Map<string, Promise<NovaPoshtaCityRecord[]>>();
  const warehouseInFlight = new Map<
    string,
    Promise<NovaPoshtaWarehouseRecord[]>
  >();

  return {
    getCities(query: string, apiKey: string, signal?: AbortSignal) {
      const key = query.toLocaleLowerCase("uk-UA");
      const cached = cityCache.get(key);

      if (cached) {
        return Promise.resolve(cached);
      }

      const pending = cityInFlight.get(key);

      if (pending) {
        return pending;
      }

      if (cityInFlight.size >= NOVA_POSHTA_CITY_IN_FLIGHT_MAX_ENTRIES) {
        return Promise.reject(new NovaPoshtaUnavailableError());
      }

      const request = gate
        .run(() =>
          fetchNovaPoshtaData<NovaPoshtaCityRecord>({
            apiKey,
            modelName: "Address",
            calledMethod: "getCities",
            methodProperties: { FindByString: query, Limit: 20 },
            fetcher,
            timeoutMs,
            signal,
          })
        )
        .then((records) => {
          const boundedRecords = records.slice(0, 20);
          cityCache.set(
            key,
            boundedRecords,
            boundedRecords.length > 0
              ? NOVA_POSHTA_CITY_CACHE_TTL_MS
              : NOVA_POSHTA_CITY_NEGATIVE_CACHE_TTL_MS
          );
          return boundedRecords;
        })
        .finally(() => {
          cityInFlight.delete(key);
        });

      cityInFlight.set(key, request);
      return request;
    },

    getWarehouses(cityRef: string, apiKey: string, signal?: AbortSignal) {
      const cached = warehouseCache.get(cityRef);

      if (cached) {
        return Promise.resolve(cached);
      }

      const pending = warehouseInFlight.get(cityRef);

      if (pending) {
        return pending;
      }

      if (
        warehouseInFlight.size >= NOVA_POSHTA_WAREHOUSE_IN_FLIGHT_MAX_ENTRIES
      ) {
        return Promise.reject(new NovaPoshtaUnavailableError());
      }

      const request = gate
        .run(() =>
          fetchNovaPoshtaData<NovaPoshtaWarehouseRecord>({
            apiKey,
            modelName: "Address",
            calledMethod: "getWarehouses",
            methodProperties: { CityRef: cityRef },
            fetcher,
            timeoutMs,
            signal,
          })
        )
        .then((records) => {
          const boundedRecords = records.slice(0, NOVA_POSHTA_RAW_WAREHOUSE_LIMIT);
          warehouseCache.set(
            cityRef,
            boundedRecords,
            NOVA_POSHTA_WAREHOUSE_CACHE_TTL_MS
          );
          return boundedRecords;
        })
        .finally(() => {
          warehouseInFlight.delete(cityRef);
        });

      warehouseInFlight.set(cityRef, request);
      return request;
    },
  };
}

export const novaPoshtaClient = createNovaPoshtaClient();

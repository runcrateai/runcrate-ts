'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var crypto = require('crypto');
var promises = require('fs/promises');
var fs = require('fs');
var path = require('path');
var stream = require('stream');
var promises$1 = require('stream/promises');

// src/transport.ts

// src/errors.ts
var RuncrateError = class extends Error {
  /**
   * The idempotency key of the call that failed, when it had one (`billing.topUp`). Send the
   * same key again to read or finish that call instead of starting a new one.
   */
  idempotencyKey;
  constructor(message) {
    super(message);
    this.name = "RuncrateError";
  }
};
var ApiError = class extends RuncrateError {
  statusCode;
  code;
  details;
  constructor(message, statusCode, code, details) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
};
var BadRequestError = class extends ApiError {
  constructor(message, code, details) {
    super(message, 400, code, details);
    this.name = "BadRequestError";
  }
};
var AuthenticationError = class extends ApiError {
  constructor(message, code, details) {
    super(message, 401, code, details);
    this.name = "AuthenticationError";
  }
};
var InsufficientCreditsError = class extends ApiError {
  constructor(message, code, details) {
    super(message, 402, code, details);
    this.name = "InsufficientCreditsError";
  }
};
var PermissionDeniedError = class extends ApiError {
  constructor(message, code, details) {
    super(message, 403, code, details);
    this.name = "PermissionDeniedError";
  }
};
var NotFoundError = class extends ApiError {
  constructor(message, code, details) {
    super(message, 404, code, details);
    this.name = "NotFoundError";
  }
};
var ConflictError = class extends ApiError {
  constructor(message, code, details) {
    super(message, 409, code, details);
    this.name = "ConflictError";
  }
};
var UnprocessableEntityError = class extends ApiError {
  constructor(message, code, details) {
    super(message, 422, code, details);
    this.name = "UnprocessableEntityError";
  }
};
var RateLimitError = class extends ApiError {
  constructor(message, code, details) {
    super(message, 429, code, details);
    this.name = "RateLimitError";
  }
};
var InternalServerError = class extends ApiError {
  constructor(message, code, details) {
    super(message, 500, code, details);
    this.name = "InternalServerError";
  }
};
var ConnectionError = class extends RuncrateError {
  constructor(message) {
    super(message);
    this.name = "ConnectionError";
  }
};
var TimeoutError = class extends RuncrateError {
  constructor(message) {
    super(message);
    this.name = "TimeoutError";
  }
};
var JobWaitTimeoutError = class extends TimeoutError {
  job;
  constructor(message, job) {
    super(message);
    this.name = "JobWaitTimeoutError";
    this.job = job;
  }
};
var STATUS_MAP = {
  400: BadRequestError,
  401: AuthenticationError,
  402: InsufficientCreditsError,
  403: PermissionDeniedError,
  404: NotFoundError,
  409: ConflictError,
  422: UnprocessableEntityError,
  429: RateLimitError,
  500: InternalServerError
};
function extractErrorInfo(body) {
  if (!body || typeof body !== "object") {
    return { message: null, code: null, details: void 0 };
  }
  const b = body;
  if (b.error && typeof b.error === "object") {
    const e = b.error;
    return {
      message: e.message ?? null,
      code: e.code ?? null,
      details: e.details
    };
  }
  if (typeof b.error === "string") {
    return { message: b.error, code: null, details: void 0 };
  }
  if (typeof b.message === "string") {
    return { message: b.message, code: b.code ?? null, details: void 0 };
  }
  if (typeof b.detail === "string") {
    return { message: b.detail, code: null, details: void 0 };
  }
  return { message: JSON.stringify(body), code: null, details: void 0 };
}
function makeApiError(statusCode, body, fallbackMessage) {
  const { message: extractedMessage, code: extractedCode, details } = extractErrorInfo(body);
  const message = extractedMessage ?? fallbackMessage;
  const code = extractedCode ?? "api_error";
  const Cls = STATUS_MAP[statusCode];
  if (!Cls) {
    return new ApiError(message, statusCode, code, details);
  }
  return new Cls(message, code, details);
}

// src/util.ts
function removeUndefined(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== void 0) {
      result[key] = value;
    }
  }
  return result;
}
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function toSnakeCase(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== void 0) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        result[camelToSnake(key)] = toSnakeCase(value);
      } else {
        result[camelToSnake(key)] = value;
      }
    }
  }
  return result;
}
function toCamelCase(obj, rawKeys) {
  if (obj === null || obj === void 0) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => toCamelCase(item, rawKeys));
  }
  if (typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[snakeToCamel(key)] = rawKeys?.includes(key) ? value : toCamelCase(value, rawKeys);
    }
    return result;
  }
  return obj;
}

// src/transport.ts
var RETRYABLE_STATUS_CODES = { 429: true, 500: true, 502: true, 503: true, 504: true };
var NOT_ACTED_ON_STATUS_CODES = { 429: true, 503: true };
var NOT_SENT_ERROR_CODES = {
  ECONNREFUSED: true,
  ENOTFOUND: true,
  EAI_AGAIN: true,
  EHOSTUNREACH: true,
  ENETUNREACH: true,
  UND_ERR_CONNECT_TIMEOUT: true
};
var IN_PROGRESS_MIN_DELAY = 3e3;
var BASE_DELAY = 500;
var MAX_DELAY = 3e4;
var JITTER_FACTOR = 0.25;
var MAX_RETRY_AFTER = 60;
var NON_RETRYABLE_CODES = { launch_refused: true };
var LAUNCH_TIMEOUT = 75;
function newIdempotencyKey() {
  return crypto.randomUUID();
}
function backoffDelay(attempt, retryAfter) {
  if (retryAfter !== void 0) return Math.min(Math.max(retryAfter, 0), MAX_RETRY_AFTER) * 1e3;
  const delay = Math.min(BASE_DELAY * 2 ** attempt, MAX_DELAY);
  const jitter = delay * JITTER_FACTOR * Math.random();
  return delay + jitter;
}
function parseRetryAfter(headers) {
  const value = headers.get("retry-after");
  if (!value) return void 0;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? void 0 : parsed;
}
async function errorInfo(response) {
  const none = { code: null, reason: null };
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) return none;
  try {
    const json = await response.clone().json();
    const code = json?.error?.code;
    const reason = json?.error?.details?.reason;
    return { code: typeof code === "string" ? code : null, reason: typeof reason === "string" ? reason : null };
  } catch {
    return none;
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function buildUrl(baseUrl, path, params) {
  const url = new URL(path, baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === void 0 || value === null) continue;
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
    }
  }
  return url.toString();
}
var Transport = class {
  config;
  headers;
  constructor(config) {
    this.config = config;
    this.headers = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "runcrate-ts/0.1.0",
      ...config.customHeaders
    };
  }
  async request(options) {
    const response = await this.send(options);
    if (response.status === 204) {
      return { data: void 0 };
    }
    if (options.raw) {
      const buffer = await response.arrayBuffer();
      if (response.status >= 400) {
        throw makeApiError(response.status, null, `HTTP ${response.status}`);
      }
      return { data: buffer };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      if (response.status >= 400) {
        throw makeApiError(response.status, null, text.slice(0, 200));
      }
      throw new ApiError(
        `Expected JSON response but got ${contentType} (status ${response.status}). Check that baseUrl is correct.`,
        response.status,
        "invalid_response"
      );
    }
    const json = await response.json();
    if (response.status >= 400) {
      throw makeApiError(
        response.status,
        json,
        `HTTP ${response.status}`
      );
    }
    const rawData = options.noUnwrap ? json : json.data ?? json;
    const data = toCamelCase(rawData, options.rawKeys);
    const meta = options.noUnwrap ? void 0 : toCamelCase(json.meta);
    return { data, meta };
  }
  /**
   * Where a redirecting GET (an artifact download) points, without following it: the signed URL
   * needs no API key, and the key must not travel to another host.
   */
  async redirectLocation(options) {
    const response = await this.send({ ...options, method: "GET" }, "manual");
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      return new URL(location, this.config.baseUrl).toString();
    }
    const json = (response.headers.get("content-type") ?? "").includes("application/json") ? await response.json().catch(() => null) : null;
    throw makeApiError(response.status >= 400 ? response.status : 502, json, `Expected a redirect, got HTTP ${response.status}`);
  }
  /**
   * Sends the request, retrying what is safe to retry (RequestOptions.idempotent), and answers
   * the last response; throws a TimeoutError or ConnectionError when no response came.
   */
  async send(options, redirect = "follow") {
    const { method, path, params, body, timeout, minTimeout, idempotencyKey } = options;
    const idempotent = options.idempotent ?? (method.toUpperCase() !== "POST" || this.config.postsAreIdempotent === true);
    const mergedParams = this.config.environment ? { environment: this.config.environment, ...params } : params;
    const url = buildUrl(this.config.baseUrl, path, mergedParams);
    const headers = idempotencyKey ? { ...this.headers, "Idempotency-Key": idempotencyKey } : this.headers;
    const timeoutMs = Math.max(timeout ?? this.config.timeout, minTimeout ?? 0) * 1e3;
    let lastError;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const canRetry = attempt < this.config.maxRetries;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : void 0,
          signal: controller.signal,
          redirect
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          lastError = new TimeoutError(`Request timed out: ${method} ${path}`);
        } else {
          lastError = new ConnectionError(
            `Connection failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        const cause = err?.cause;
        const notSent = typeof cause?.code === "string" && NOT_SENT_ERROR_CODES[cause.code] === true;
        if (canRetry && (idempotent || notSent)) {
          await sleep(backoffDelay(attempt));
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
      }
      if (canRetry && (RETRYABLE_STATUS_CODES[response.status] || response.status === 409)) {
        const { code, reason } = await errorInfo(response);
        const retryAfter = parseRetryAfter(response.headers);
        if (response.status === 409) {
          if (idempotencyKey && reason === "idempotency_in_progress") {
            await sleep(Math.max(backoffDelay(attempt, retryAfter), IN_PROGRESS_MIN_DELAY));
            continue;
          }
        } else if (!NON_RETRYABLE_CODES[code ?? ""] && (idempotent || NOT_ACTED_ON_STATUS_CODES[response.status])) {
          await sleep(backoffDelay(attempt, retryAfter));
          continue;
        }
      }
      return response;
    }
    throw lastError ?? new Error("Unexpected retry exhaustion");
  }
  async streamRequest(options) {
    const { method, path, params, body, timeout } = options;
    const url = buildUrl(this.config.baseUrl, path, params);
    const controller = new AbortController();
    const timeoutMs = (timeout ?? this.config.timeout) * 1e3;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new TimeoutError(`Request timed out: ${method} ${path}`);
      }
      throw new ConnectionError(
        `Connection failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    clearTimeout(timer);
    if (response.status >= 400) {
      const json = await response.json().catch(() => null);
      throw makeApiError(
        response.status,
        json,
        `HTTP ${response.status}`
      );
    }
    return response;
  }
};

// src/resources/instances.ts
var Instances = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  async list(params) {
    const { data } = await this.transport.request({
      method: "GET",
      path: "/api/v1/instances",
      params: params ? removeUndefined(params) : void 0
    });
    return data;
  }
  /**
   * Launch an instance. For unattended agent work, set `maxRuntimeMinutes` (5 to 10080) and
   * `idleShutdownMinutes` (5 to 1440) so the instance stops on its own. Values outside those
   * ranges are rejected with an `UnprocessableEntityError` (422). If the environment's monthly budget is
   * reached, this throws an `InsufficientCreditsError` with `code` `"BUDGET_REACHED"`.
   *
   * A launch is never sent twice once it may have reached Runcrate: a timeout or a lost connection
   * throws (check `instances.list()` before launching again), and only a 429 or 503, which say
   * nothing was launched, are retried.
   */
  async create(params) {
    const { data } = await this.transport.request({
      method: "POST",
      path: "/api/v1/instances",
      body: toSnakeCase(params),
      idempotencyKey: newIdempotencyKey(),
      minTimeout: LAUNCH_TIMEOUT
    });
    return data;
  }
  async get(id) {
    const { data } = await this.transport.request({
      method: "GET",
      path: `/api/v1/instances/${id}`
    });
    return data;
  }
  /**
   * Change a starting or running instance's auto stop, by id or unique name. Returns the instance
   * with its new `autoStopAt`. An out-of-range value throws an `UnprocessableEntityError` (422);
   * a `ConflictError` (409) means the instance is not live, has
   * no GPU for idle stop, or was launched before idle stop existed.
   */
  async update(id, params) {
    const { data } = await this.transport.request({
      method: "PATCH",
      path: `/api/v1/instances/${encodeURIComponent(id)}`,
      body: toSnakeCase(params)
    });
    return data;
  }
  async terminate(id) {
    await this.transport.request({
      method: "DELETE",
      path: `/api/v1/instances/${id}`
    });
  }
  async getStatus(id) {
    const { data } = await this.transport.request({
      method: "GET",
      path: `/api/v1/instances/${id}/status`
    });
    return data;
  }
  async listTypes(params) {
    const { data } = await this.transport.request({
      method: "GET",
      path: "/api/v1/instances/types",
      params: params ? removeUndefined(params) : void 0
    });
    return data;
  }
};

// src/resources/environments.ts
var Environments = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  async list() {
    const { data } = await this.transport.request({
      method: "GET",
      path: "/api/v1/environments"
    });
    return data;
  }
  async create(params) {
    const { data } = await this.transport.request({
      method: "POST",
      path: "/api/v1/environments",
      body: toSnakeCase(params)
    });
    return data;
  }
  /**
   * Get an environment, including its monthly budget (`monthlyBudgetUsd`), spend so far this
   * UTC month (`monthToDateUsd`) and what is left (`budgetRemainingUsd`). Budgets are read-only
   * here: a workspace owner or admin sets them in the dashboard.
   */
  async get(id) {
    const { data } = await this.transport.request({
      method: "GET",
      path: `/api/v1/environments/${id}`
    });
    return data;
  }
  async update(id, params) {
    const { data } = await this.transport.request({
      method: "PATCH",
      path: `/api/v1/environments/${id}`,
      body: toSnakeCase(params)
    });
    return data;
  }
  async delete(id) {
    await this.transport.request({
      method: "DELETE",
      path: `/api/v1/environments/${id}`
    });
  }
};

// src/resources/ssh-keys.ts
var SSHKeys = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  async list() {
    const { data } = await this.transport.request({
      method: "GET",
      path: "/api/v1/ssh-keys"
    });
    return data;
  }
  async create(params) {
    const { data } = await this.transport.request({
      method: "POST",
      path: "/api/v1/ssh-keys",
      body: toSnakeCase(params)
    });
    return data;
  }
  async delete(id) {
    await this.transport.request({
      method: "DELETE",
      path: `/api/v1/ssh-keys/${id}`
    });
  }
};

// src/resources/secrets.ts
var Secrets = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  /** The secrets set in the environment, sorted by name. Never their values. */
  async list() {
    const { data } = await this.transport.request({
      method: "GET",
      path: "/api/v1/secrets"
    });
    return data.map(({ key, sensitive, updatedAt }) => ({ key, sensitive, updatedAt }));
  }
};

// src/resources/storage.ts
var Storage = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  async list(params) {
    const { data } = await this.transport.request({
      method: "GET",
      path: "/api/v1/storage",
      params: params ? removeUndefined(params) : void 0
    });
    return data;
  }
  async get(id) {
    const { data } = await this.transport.request({
      method: "GET",
      path: `/api/v1/storage/${id}`
    });
    return data;
  }
  async listRegions() {
    const { data } = await this.transport.request({
      method: "GET",
      path: "/api/v1/storage/regions"
    });
    return data;
  }
  async create(params) {
    const { data } = await this.transport.request({
      method: "POST",
      path: "/api/v1/storage",
      body: toSnakeCase(params),
      idempotencyKey: newIdempotencyKey()
    });
    return data;
  }
  async resize(id, sizeGb) {
    const { data } = await this.transport.request({
      method: "PATCH",
      path: `/api/v1/storage/${id}`,
      body: { size_gb: sizeGb }
    });
    return data;
  }
  async delete(id) {
    const { data } = await this.transport.request({
      method: "DELETE",
      path: `/api/v1/storage/${id}`
    });
    return data;
  }
};

// src/pagination.ts
var PaginatedResponse = class {
  data;
  meta;
  constructor(data, meta) {
    this.data = data;
    this.meta = meta ?? {};
  }
  get hasMore() {
    return this.meta.hasMore ?? false;
  }
  get cursor() {
    return this.meta.cursor;
  }
  get total() {
    return this.meta.total;
  }
  [Symbol.iterator]() {
    return this.data[Symbol.iterator]();
  }
  get length() {
    return this.data.length;
  }
};

// src/resources/billing.ts
var Billing = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  async getBalance() {
    const { data } = await this.transport.request({
      method: "GET",
      path: "/api/v1/billing/balance"
    });
    return data;
  }
  async listTransactions(params) {
    const queryParams = {
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0,
      type: params?.type
    };
    const { data, meta } = await this.transport.request({
      method: "GET",
      path: "/api/v1/billing/transactions",
      params: removeUndefined(queryParams)
    });
    return new PaginatedResponse(data, meta);
  }
  async usage(params) {
    const { data } = await this.transport.request({
      method: "GET",
      path: "/api/v1/billing/usage",
      params: params ? removeUndefined(params) : void 0
    });
    return data;
  }
  /**
   * Adds credit to the balance by charging the workspace's default card. Needs a key with the
   * billing permission. Every outcome answers here, including a decline or a charge that needs
   * a person to confirm it: read `status`. To read a `processing` or `requires_action` top-up
   * again, call this with the same `idempotencyKey` (returned on the result): the same key never
   * charges twice. An error thrown here carries the key as `err.idempotencyKey`.
   */
  async topUp(params) {
    const key = params.idempotencyKey ?? newIdempotencyKey();
    try {
      const { data } = await this.transport.request({
        method: "POST",
        path: "/api/v1/billing/topups",
        body: { amount_usd: params.amountUsd, idempotency_key: key },
        // Also as the header, so the transport waits and resends while that top-up is being charged.
        idempotencyKey: key,
        // The route dedupes on the key: sending it again answers the same top-up.
        idempotent: true
      });
      return data;
    } catch (err) {
      if (err instanceof RuncrateError) err.idempotencyKey = key;
      throw err;
    }
  }
  async getAutoRecharge() {
    const { data } = await this.transport.request({
      method: "GET",
      path: "/api/v1/billing/auto-recharge"
    });
    return data;
  }
  /**
   * Turns auto-recharge on or off. `thresholdUsd` and `targetUsd` are required either way. Needs
   * a key with the billing permission, made by a workspace owner or manager.
   */
  async setAutoRecharge(params) {
    const { data } = await this.transport.request({
      method: "PUT",
      path: "/api/v1/billing/auto-recharge",
      body: {
        enabled: params.enabled,
        threshold_usd: params.thresholdUsd,
        target_usd: params.targetUsd
      }
    });
    return data;
  }
  /** The workspace's saved cards. Cards are added in the dashboard, never by API. */
  async listPaymentMethods() {
    const { data } = await this.transport.request({
      method: "GET",
      path: "/api/v1/billing/payment-methods"
    });
    return data;
  }
};

// src/resources/templates.ts
var Templates = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  async list(params) {
    const queryParams = {
      page: params?.page ?? 1,
      page_size: params?.pageSize ?? 25,
      search: params?.search,
      category: params?.category,
      sort_by: params?.sortBy,
      sort_dir: params?.sortDir
    };
    const { data, meta } = await this.transport.request({
      method: "GET",
      path: "/api/v1/templates",
      params: removeUndefined(queryParams)
    });
    return new PaginatedResponse(data, meta);
  }
};

// src/resources/schedules.ts
function specBody(spec) {
  const { env, ...rest } = spec;
  const body = toSnakeCase(rest);
  if (env !== void 0) body.env = env;
  return body;
}
var Schedules = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  /**
   * Schedule an instance launch or a job, once (`runAt`) or on a recurring `cron` in `timezone`.
   * It starts within about 2 minutes of its time, as you, in this environment. Always set
   * `spec.maxRuntimeMinutes`. A bad spec, cron or time throws an `UnprocessableEntityError`
   * (422); more than 50 schedules in the environment or 200 in the workspace throws a
   * `ConflictError` (409).
   */
  async create(params) {
    const { kind, spec, runAt, cron, timezone, overlap, name, enabled } = params;
    const { data } = await this.transport.request({
      method: "POST",
      path: "/api/v1/schedules",
      idempotencyKey: newIdempotencyKey(),
      body: removeUndefined({
        kind,
        spec: specBody(spec),
        run_at: runAt instanceof Date ? runAt.toISOString() : runAt,
        cron,
        timezone,
        overlap,
        name,
        enabled
      })
    });
    return data;
  }
  /** This environment's schedules, newest first. */
  async list() {
    const { data } = await this.transport.request({
      method: "GET",
      path: "/api/v1/schedules"
    });
    return data;
  }
  async get(id) {
    const { data } = await this.transport.request({
      method: "GET",
      path: `/api/v1/schedules/${id}`
    });
    return data;
  }
  /**
   * Pause (`{ enabled: false }`), resume (`{ enabled: true }`), retime, rename or change a
   * schedule. Resuming a one-off whose time has passed, without a new `runAt`, throws a
   * `ConflictError` (409).
   */
  async update(id, params) {
    const { spec, runAt, cron, timezone, overlap, name, enabled } = params;
    const { data } = await this.transport.request({
      method: "PATCH",
      path: `/api/v1/schedules/${id}`,
      body: removeUndefined({
        enabled,
        run_at: runAt instanceof Date ? runAt.toISOString() : runAt,
        cron,
        timezone,
        overlap,
        name,
        spec: spec ? specBody(spec) : void 0
      })
    });
    return data;
  }
  async delete(id) {
    const { data } = await this.transport.request({
      method: "DELETE",
      path: `/api/v1/schedules/${id}`
    });
    return data;
  }
  /**
   * Launch a schedule's instance or job now, enabled or not. Does not move `nextRunAt`.
   * A reached environment budget throws an `InsufficientCreditsError` with `code`
   * `"BUDGET_REACHED"`; a low balance, the same error with `code` `"insufficient_credits"`.
   */
  async runNow(id) {
    const { data } = await this.transport.request({
      method: "POST",
      path: `/api/v1/schedules/${id}/run-now`,
      // It launches a machine and is not deduplicated: never sent twice once it may have arrived.
      minTimeout: LAUNCH_TIMEOUT
    });
    return data;
  }
};

// src/streaming.ts
async function* parseSSEStream(response) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;
        try {
          yield JSON.parse(data);
        } catch {
          continue;
        }
      }
    }
    if (buffer.trim().startsWith("data: ")) {
      const data = buffer.trim().slice(6);
      if (data !== "[DONE]") {
        try {
          yield JSON.parse(data);
        } catch {
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// src/resources/models.ts
var IMAGE_FIELDS = /* @__PURE__ */ new Set(["image", "startImage", "start_image", "mask", "controlImage", "control_image"]);
var MIME_MAP = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};
async function resolveImage(value) {
  if (typeof value !== "string") return value;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) return value;
  if (value.length > 200 && !value.includes("/") && !value.includes("\\")) return value;
  if (fs.existsSync(value)) {
    const ext = path.extname(value).toLowerCase();
    const mime = MIME_MAP[ext] ?? "image/png";
    const data = await promises.readFile(value);
    return `data:${mime};base64,${data.toString("base64")}`;
  }
  return value;
}
async function resolveImageFields(params) {
  for (const key of Object.keys(params)) {
    if (IMAGE_FIELDS.has(key)) {
      params[key] = await resolveImage(params[key]);
    }
  }
  return params;
}
function decodeImageBytes(imgData) {
  if (imgData.b64Json) {
    return Buffer.from(imgData.b64Json, "base64");
  }
  if (imgData.url?.startsWith("data:")) {
    const raw = imgData.url.split(",")[1];
    if (raw) return Buffer.from(raw, "base64");
  }
  return null;
}
var Models = class {
  constructor(transport, inferenceUrl, apiKey) {
    this.transport = transport;
    this.inferenceUrl = inferenceUrl;
    this.apiKey = apiKey;
  }
  transport;
  inferenceUrl;
  apiKey;
  async chatCompletion(params) {
    const body = removeUndefined(params);
    if (params.stream) {
      const response = await this.transport.streamRequest({
        method: "POST",
        path: "/v1/chat/completions",
        body,
        timeout: 120
      });
      return parseSSEStream(response);
    }
    const { data } = await this.transport.request({
      method: "POST",
      path: "/v1/chat/completions",
      body,
      noUnwrap: true
    });
    return data;
  }
  async generateImage(params) {
    const body = await resolveImageFields(removeUndefined(params));
    const { data } = await this.transport.request({
      method: "POST",
      path: "/v1/images/generations",
      body,
      timeout: 120,
      noUnwrap: true
    });
    const result = data;
    result.save = async (path) => {
      const imgData = result.data[0];
      if (!imgData) throw new Error("No image data in response");
      const bytes = decodeImageBytes(imgData);
      if (bytes) {
        await promises.writeFile(path, bytes);
        return;
      }
      if (imgData.url) {
        const resp = await fetch(imgData.url);
        await promises.writeFile(path, Buffer.from(await resp.arrayBuffer()));
        return;
      }
      throw new Error("No image data available to save");
    };
    return result;
  }
  async generateVideo(params) {
    const body = await resolveImageFields(removeUndefined(params));
    const { data } = await this.transport.request({
      method: "POST",
      path: "/v1/videos",
      body,
      timeout: 120,
      noUnwrap: true
    });
    return data;
  }
  async getVideoStatus(id) {
    const { data } = await this.transport.request({
      method: "GET",
      path: `/v1/videos/${id}`,
      noUnwrap: true
    });
    return data;
  }
  async downloadVideo(id) {
    const { data } = await this.transport.request({
      method: "GET",
      path: `/v1/videos/${id}/download`,
      timeout: 120,
      raw: true
    });
    return Buffer.from(data);
  }
  async generateVideoAndSave(path, params) {
    const { pollInterval = 5e3, onStatus, ...genParams } = params;
    let job = await this.generateVideo(genParams);
    while (job.status !== "completed" && job.status !== "failed") {
      await new Promise((r) => setTimeout(r, pollInterval));
      job = await this.getVideoStatus(job.id);
      onStatus?.(job);
    }
    if (job.status === "failed") {
      throw new Error(`Video generation failed (job ${job.id})`);
    }
    const videoBytes = await this.downloadVideo(job.id);
    await promises.writeFile(path, videoBytes);
    return job;
  }
  async textToSpeech(params) {
    const { data } = await this.transport.request({
      method: "POST",
      path: "/v1/audio/speech",
      body: removeUndefined(params),
      timeout: 120,
      raw: true
    });
    return Buffer.from(data);
  }
  async textToSpeechAndSave(path, params) {
    const audio = await this.textToSpeech(params);
    await promises.writeFile(path, audio);
  }
  async transcribe(params) {
    const { model, file, filename = "audio.wav", language, responseFormat, ...extra } = params;
    const formData = new FormData();
    formData.append("model", model);
    if (language) formData.append("language", language);
    if (responseFormat) formData.append("response_format", responseFormat);
    for (const [key, value] of Object.entries(extra)) {
      if (value !== void 0) formData.append(key, String(value));
    }
    if (file instanceof Blob) {
      formData.append("file", file, filename);
    } else {
      formData.append("file", new Blob([file]), filename);
    }
    const response = await fetch(
      `${this.inferenceUrl}/v1/audio/transcriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "User-Agent": "runcrate-ts/0.1.0"
        },
        body: formData
      }
    );
    if (response.status >= 400) {
      const json = await response.json().catch(() => null);
      throw makeApiError(response.status, json, `HTTP ${response.status}`);
    }
    return await response.json();
  }
};
var PATH = "/api/v1/jobs";
var RAW_KEYS = ["tags", "status_counts"];
var SUBMIT_TIMEOUT = 135;
var FOLLOW_TIMEOUT = 40;
var GROUP_CANCEL_TIMEOUT = 315;
var LIVE = { queued: true, starting: true, running: true };
function isJobFinished(status) {
  return !LIVE[status];
}
var jobPath = (id, suffix = "") => `${PATH}/${encodeURIComponent(id)}${suffix}`;
function submitBody(params) {
  const { env, tags, params: groupParams, ...rest } = params;
  const body = toSnakeCase(rest);
  if (env !== void 0) body.env = env;
  if (tags !== void 0) body.tags = tags;
  if (groupParams !== void 0) body.params = groupParams;
  return body;
}
function sleep2(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
  });
}
async function fetchSigned(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new ConnectionError(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok || !response.body) {
    throw new ApiError(`Downloading the file failed (HTTP ${response.status})`, response.status, "download_failed");
  }
  return response;
}
var JobArtifacts = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  /** The job's outputs by path, kept 30 days after it ended. */
  async list(jobId) {
    const { data } = await this.transport.request({ method: "GET", path: jobPath(jobId, "/artifacts") });
    return data;
  }
  /** A signed URL that downloads one output, valid for an hour. Needs no API key. */
  async url(jobId, path) {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return this.transport.redirectLocation({ path: jobPath(jobId, `/artifacts/${encoded}`) });
  }
  /** One output's bytes, in memory. Use `downloadTo` for large files. */
  async download(jobId, path) {
    const response = await fetchSigned(await this.url(jobId, path));
    return Buffer.from(await response.arrayBuffer());
  }
  /** Streams one output to `destination` on disk (the file is replaced). */
  async downloadTo(jobId, path, destination) {
    const response = await fetchSigned(await this.url(jobId, path));
    await promises$1.pipeline(stream.Readable.fromWeb(response.body), fs.createWriteStream(destination));
  }
};
var JobUploads = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  /**
   * Somewhere to PUT a tar.gz of `bytes` (at most 1 GB). With `sha256`, the same archive again
   * answers the same upload. Use `upload()` to do both steps.
   */
  async create(params) {
    const { data } = await this.transport.request({
      method: "POST",
      path: `${PATH}/uploads`,
      body: removeUndefined(params),
      // The same hash answers the same upload, so a repeat makes no second one.
      idempotent: params.sha256 !== void 0
    });
    return data;
  }
  /**
   * Uploads a tar.gz (its bytes, or a path to one) and answers the upload: run a job with
   * `code: { uploadId: upload.uploadId }` within 24 hours. The same archive again is not sent twice.
   */
  async upload(archive) {
    const bytes = typeof archive === "string" ? await promises.readFile(archive) : archive;
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const upload = await this.create({ bytes: bytes.byteLength, sha256 });
    if (upload.url) {
      let response;
      try {
        response = await fetch(upload.url, { method: "PUT", body: bytes });
      } catch (err) {
        throw new ConnectionError(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (!response.ok) {
        throw new ApiError(`Uploading the code failed (HTTP ${response.status})`, response.status, "upload_failed");
      }
    }
    return upload;
  }
};
var Jobs = class {
  constructor(transport) {
    this.transport = transport;
    this.artifacts = new JobArtifacts(transport);
    this.uploads = new JobUploads(transport);
  }
  transport;
  artifacts;
  uploads;
  /**
   * Run one job. Answers it queued or starting; `wait()` for the end. A low balance throws an
   * `InsufficientCreditsError`, a reached environment budget the same with `code`
   * `"BUDGET_REACHED"`, a bad field an `UnprocessableEntityError`. For several jobs at once use
   * `runGroup()`.
   */
  async run(params, options) {
    if ("count" in params || "params" in params) {
      throw new TypeError("jobs.run() runs one job: use jobs.runGroup() for count or params");
    }
    return this.submit(PATH, submitBody(params), options);
  }
  /**
   * Run a group of jobs: `count` copies of one, or one per `params` entry (each merged over
   * `env`), at most `maxParallel` at once. Answers the group with its jobs.
   */
  async runGroup(params, options) {
    return this.submit(PATH, submitBody(params), options);
  }
  /**
   * Run a job's spec again as a new job (its `rerunOf` set), with its env values. `overrides`
   * changes fields; its `env` is merged over the job's. Only whoever submitted the job can reuse
   * its env values; anyone else must send them.
   */
  async rerun(id, overrides, options) {
    return this.submit(jobPath(id, "/rerun"), submitBody(overrides ?? {}), options);
  }
  async submit(path, body, options) {
    const { data } = await this.transport.request({
      method: "POST",
      path,
      body,
      idempotencyKey: options?.idempotencyKey ?? newIdempotencyKey(),
      idempotent: true,
      minTimeout: SUBMIT_TIMEOUT,
      rawKeys: RAW_KEYS
    });
    return data;
  }
  async get(id) {
    const { data } = await this.transport.request({ method: "GET", path: jobPath(id), rawKeys: RAW_KEYS });
    return data;
  }
  /** One page of jobs, newest first. Pass `cursor` for the next page, or use `listAll()`. */
  async list(params = {}) {
    const { status, tags, groupId, q, gpuType, createdAfter, limit, cursor } = params;
    const { data, meta } = await this.transport.request({
      method: "GET",
      path: PATH,
      params: {
        status: Array.isArray(status) ? status.join(",") : status,
        tag: tags ? Object.entries(tags).map(([key, value]) => `${key}:${value}`) : void 0,
        group_id: groupId,
        q,
        gpu_type: gpuType,
        created_after: createdAfter instanceof Date ? createdAfter.toISOString() : createdAfter,
        limit,
        cursor
      },
      rawKeys: RAW_KEYS
    });
    return new PaginatedResponse(data, meta);
  }
  /** Every job matching `params`, newest first, page by page. */
  async *listAll(params = {}) {
    let cursor;
    do {
      const page = await this.list({ ...params, cursor });
      yield* page.data;
      cursor = page.hasMore && page.cursor ? page.cursor : void 0;
    } while (cursor);
  }
  /** Stops the job's machine; the job becomes `cancelled`. A job that ended otherwise throws a `ConflictError`. */
  async cancel(id) {
    const { data } = await this.transport.request({
      method: "POST",
      path: jobPath(id, "/cancel"),
      // Cancelling a cancelled job answers it unchanged.
      idempotent: true,
      minTimeout: SUBMIT_TIMEOUT,
      rawKeys: RAW_KEYS
    });
    return data;
  }
  /** Deletes a job that ended, with its logs and outputs. A live job throws a `ConflictError`: cancel it first. */
  async delete(id) {
    await this.transport.request({ method: "DELETE", path: jobPath(id) });
  }
  /** One page of the job's output after `after`. */
  async logs(id, params = {}) {
    const { data } = await this.transport.request({
      method: "GET",
      path: jobPath(id, "/logs"),
      params: { after: params.after, limit: params.limit, follow: params.follow ? "true" : void 0 },
      minTimeout: params.follow ? FOLLOW_TIMEOUT : void 0
    });
    return data;
  }
  /**
   * The job's output as it is written, chunk by chunk, until the job ends and every chunk was
   * read. Starts at `after` (default 0, the start). Stop early with `signal` or by breaking out.
   */
  async *followLogs(id, options = {}) {
    let after = options.after ?? 0;
    while (!options.signal?.aborted) {
      const page = await this.logs(id, { after, follow: true });
      yield* page.chunks;
      after = Math.max(after, page.cursor);
      if (page.done) return;
      if (page.chunks.length === 0) await sleep2(1e3, options.signal);
    }
  }
  /** The job's timeline, oldest first. */
  async events(id) {
    const { data } = await this.transport.request({ method: "GET", path: jobPath(id, "/events") });
    return data;
  }
  /** GPU use while the command ran, oldest first, one point per `step` seconds (60 to 86400). */
  async metrics(id, params = {}) {
    const { data } = await this.transport.request({
      method: "GET",
      path: jobPath(id, "/metrics"),
      params: { step: params.step }
    });
    return data;
  }
  /**
   * Polls the job until it ends (succeeded, failed, cancelled or timed out) and answers it. The
   * gap between polls starts at `pollInterval` and doubles up to `maxPollInterval`. Past
   * `timeout` seconds it throws a `JobWaitTimeoutError` holding the job as last seen; the job
   * keeps running.
   */
  async wait(id, options = {}) {
    const { timeout, pollInterval = 2, maxPollInterval = 30 } = options;
    const deadline = timeout === void 0 ? Infinity : Date.now() + timeout * 1e3;
    let gap = pollInterval * 1e3;
    for (; ; ) {
      const job = await this.get(id);
      if (isJobFinished(job.status)) return job;
      const left = deadline - Date.now();
      if (left <= 0) {
        throw new JobWaitTimeoutError(`Job ${job.id} is still ${job.status} after ${timeout} s`, job);
      }
      await sleep2(Math.min(gap, left));
      gap = Math.min(gap * 2, maxPollInterval * 1e3);
    }
  }
};
var JobGroups = class {
  constructor(transport) {
    this.transport = transport;
  }
  transport;
  async get(id) {
    const { data } = await this.transport.request({
      method: "GET",
      path: `/api/v1/job-groups/${encodeURIComponent(id)}`,
      rawKeys: RAW_KEYS
    });
    return data;
  }
  /** Cancels every job of the group that has not ended. */
  async cancel(id) {
    const { data } = await this.transport.request({
      method: "POST",
      path: `/api/v1/job-groups/${encodeURIComponent(id)}/cancel`,
      idempotent: true,
      minTimeout: GROUP_CANCEL_TIMEOUT,
      rawKeys: RAW_KEYS
    });
    return data;
  }
};

// src/client.ts
var DEFAULT_BASE_URL = "https://www.runcrate.ai";
var DEFAULT_INFERENCE_URL = "https://api.runcrate.ai";
var DEFAULT_TIMEOUT = 30;
var DEFAULT_MAX_RETRIES = 3;
function resolveApiKey(config) {
  const key = config?.apiKey ?? process.env.RUNCRATE_API_KEY;
  if (!key) {
    throw new Error(
      "API key is required. Pass it as `apiKey` or set the RUNCRATE_API_KEY environment variable."
    );
  }
  if (!key.startsWith("rc_live_")) {
    throw new Error(
      'Invalid API key format. Keys must start with "rc_live_".'
    );
  }
  return key;
}
function trimTrailingSlash(url) {
  return url.replace(/\/+$/, "");
}
var Runcrate = class {
  instances;
  environments;
  sshKeys;
  /** Names of the environment's secrets; values are set in the dashboard. */
  secrets;
  storage;
  billing;
  templates;
  schedules;
  /** Commands run on their own fresh GPU machine, with logs, retries and outputs. */
  jobs;
  /** Groups of jobs from `jobs.runGroup()`. */
  jobGroups;
  models;
  // ─── OpenAI-compatible aliases ─────────────────────────────────────────────
  /** OpenAI-compatible chat namespace: `rc.chat.completions.create(...)` */
  chat;
  /** OpenAI-compatible images namespace: `rc.images.generate(...)` */
  images;
  /** OpenAI-compatible audio namespace: `rc.audio.speech.create(...)`, `rc.audio.transcriptions.create(...)` */
  audio;
  /** Video namespace: `rc.videos.generate(...)` */
  videos;
  constructor(config) {
    const apiKey = resolveApiKey(config);
    const baseUrl = trimTrailingSlash(config?.baseUrl ?? DEFAULT_BASE_URL);
    const inferenceUrl = trimTrailingSlash(
      config?.inferenceUrl ?? DEFAULT_INFERENCE_URL
    );
    const timeout = config?.timeout ?? DEFAULT_TIMEOUT;
    const maxRetries = config?.maxRetries ?? DEFAULT_MAX_RETRIES;
    const customHeaders = config?.customHeaders ?? {};
    const environment = config?.environment;
    const infraTransport = new Transport({
      baseUrl,
      apiKey,
      timeout,
      maxRetries,
      customHeaders,
      environment
    });
    const inferenceTransport = new Transport({
      baseUrl: inferenceUrl,
      apiKey,
      timeout,
      maxRetries,
      customHeaders,
      // Inference calls keep retrying on server errors and timeouts.
      postsAreIdempotent: true
    });
    this.instances = new Instances(infraTransport);
    this.environments = new Environments(infraTransport);
    this.sshKeys = new SSHKeys(infraTransport);
    this.secrets = new Secrets(infraTransport);
    this.storage = new Storage(infraTransport);
    this.billing = new Billing(infraTransport);
    this.templates = new Templates(infraTransport);
    this.schedules = new Schedules(infraTransport);
    this.jobs = new Jobs(infraTransport);
    this.jobGroups = new JobGroups(infraTransport);
    this.models = new Models(inferenceTransport, inferenceUrl, apiKey);
    this.chat = {
      completions: {
        create: (params) => this.models.chatCompletion(params)
      }
    };
    this.images = {
      generate: (params) => this.models.generateImage(params)
    };
    this.audio = {
      speech: {
        create: (params) => this.models.textToSpeech(params)
      },
      transcriptions: {
        create: (params) => this.models.transcribe(params)
      }
    };
    this.videos = {
      generate: (params) => this.models.generateVideo(params),
      getStatus: (id) => this.models.getVideoStatus(id),
      download: (id) => this.models.downloadVideo(id),
      generateAndSave: (path, params) => this.models.generateVideoAndSave(path, params)
    };
  }
};

exports.ApiError = ApiError;
exports.AuthenticationError = AuthenticationError;
exports.BadRequestError = BadRequestError;
exports.ConflictError = ConflictError;
exports.ConnectionError = ConnectionError;
exports.InsufficientCreditsError = InsufficientCreditsError;
exports.InternalServerError = InternalServerError;
exports.JobWaitTimeoutError = JobWaitTimeoutError;
exports.NotFoundError = NotFoundError;
exports.PaginatedResponse = PaginatedResponse;
exports.PermissionDeniedError = PermissionDeniedError;
exports.RateLimitError = RateLimitError;
exports.Runcrate = Runcrate;
exports.RuncrateError = RuncrateError;
exports.TimeoutError = TimeoutError;
exports.UnprocessableEntityError = UnprocessableEntityError;
exports.default = Runcrate;
exports.isJobFinished = isJobFinished;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map
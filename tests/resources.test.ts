import { describe, it, expect, vi, afterEach } from "vitest";
import { Runcrate } from "../src/client.js";
import { mockFetch, TEST_API_KEY } from "./helpers.js";

function makeClient() {
  return new Runcrate({ apiKey: TEST_API_KEY, maxRetries: 0 });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Instances resource", () => {
  it("lists instances", async () => {
    const instances = [
      { id: "i1", name: "gpu-1", status: "running" },
      { id: "i2", name: "gpu-2", status: "pending" },
    ];
    mockFetch([{ body: { data: instances } }]);
    const rc = makeClient();

    const result = await rc.instances.list();
    expect(result).toEqual(instances);
  });

  it("lists instances with search param", async () => {
    const { calls } = mockFetch([{ body: { data: [] } }]);
    const rc = makeClient();

    await rc.instances.list({ search: "gpu" });
    expect(calls[0]!.url).toContain("search=gpu");
  });

  it("creates an instance", async () => {
    const created = { id: "i1", name: "my-gpu", status: "provisioning" };
    const { calls } = mockFetch([{ body: { data: created } }]);
    const rc = makeClient();

    const result = await rc.instances.create({
      name: "my-gpu",
      sshKeyId: "key_123",
      gpuType: "A100",
      gpuCount: 1,
      template: "ubuntu-cuda",
    });

    expect(result).toEqual(created);
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.name).toBe("my-gpu");
    expect(body.ssh_key_id).toBe("key_123");
    expect(body.gpu_type).toBe("A100");
  });

  it("sends guardrail params as snake_case fields", async () => {
    const { calls } = mockFetch([{ body: { data: { id: "i1", name: "agent", status: "provisioning" } } }]);
    const rc = makeClient();

    await rc.instances.create({
      name: "agent",
      sshKeyId: "key_123",
      maxRuntimeMinutes: 240,
      idleShutdownMinutes: null,
    });

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.max_runtime_minutes).toBe(240);
    expect(body.idle_shutdown_minutes).toBeNull();
    expect(body).not.toHaveProperty("maxRuntimeMinutes");
    expect(body).not.toHaveProperty("idleShutdownMinutes");
  });

  it("update sends only the given auto stop fields as a PATCH, null turning one off", async () => {
    const { calls } = mockFetch([
      { body: { data: { id: "i1", name: "train run", max_runtime_minutes: 480, idle_shutdown_minutes: null, auto_stop_at: "2026-10-20T18:00:00Z" } } },
    ]);
    const rc = makeClient();

    const inst = await rc.instances.update("train run", { maxRuntimeMinutes: 480, idleShutdownMinutes: null });

    expect(calls[0]!.init.method).toBe("PATCH");
    expect(String(calls[0]!.url)).toContain("/api/v1/instances/train%20run");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toEqual({ max_runtime_minutes: 480, idle_shutdown_minutes: null });
    expect(inst.autoStopAt).toBe("2026-10-20T18:00:00Z");
  });

  it("omits guardrail fields when the params are unset", async () => {
    const { calls } = mockFetch([{ body: { data: { id: "i1", name: "gpu", status: "provisioning" } } }]);
    const rc = makeClient();

    await rc.instances.create({ name: "gpu", sshKeyId: "key_123", maxRuntimeMinutes: undefined });

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).not.toHaveProperty("max_runtime_minutes");
    expect(body).not.toHaveProperty("idle_shutdown_minutes");
  });

  it("returns guardrail fields from the server in camelCase", async () => {
    mockFetch([{
      body: {
        data: {
          id: "i1",
          name: "agent",
          status: "terminated",
          max_runtime_minutes: 240,
          idle_shutdown_minutes: 30,
          auto_stop_at: "2026-10-20T14:00:00.000Z",
          stop_reason: "max_runtime",
        },
      },
    }]);
    const rc = makeClient();

    const result = await rc.instances.get("i1");
    expect(result.maxRuntimeMinutes).toBe(240);
    expect(result.idleShutdownMinutes).toBe(30);
    expect(result.autoStopAt).toBe("2026-10-20T14:00:00.000Z");
    expect(result.stopReason).toBe("max_runtime");
  });

  it("gets an instance by id", async () => {
    const instance = { id: "i1", name: "gpu-1", status: "running", ip: "1.2.3.4" };
    const { calls } = mockFetch([{ body: { data: instance } }]);
    const rc = makeClient();

    const result = await rc.instances.get("i1");
    expect(result).toEqual(instance);
    expect(calls[0]!.url).toContain("/api/v1/instances/i1");
  });

  it("terminates an instance", async () => {
    const { calls } = mockFetch([{ status: 204 }]);
    const rc = makeClient();

    await rc.instances.terminate("i1");
    expect(calls[0]!.init.method).toBe("DELETE");
    expect(calls[0]!.url).toContain("/api/v1/instances/i1");
  });

  it("gets instance status", async () => {
    const status = { id: "i1", status: "running", ip: "1.2.3.4" };
    const { calls } = mockFetch([{ body: { data: status } }]);
    const rc = makeClient();

    const result = await rc.instances.getStatus("i1");
    expect(result).toEqual(status);
    expect(calls[0]!.url).toContain("/api/v1/instances/i1/status");
  });

  it("lists instance types with filters", async () => {
    const types = [
      { id: "t1", gpuType: "A100", gpuCount: 1, cpuCores: 8, memoryGb: 80, storageGb: 200, region: "us-east", hourlyRate: 2.5 },
    ];
    const { calls } = mockFetch([{ body: { data: types } }]);
    const rc = makeClient();

    const result = await rc.instances.listTypes({ gpuType: "A100", region: "us-east" });
    expect(result).toEqual(types);
    expect(calls[0]!.url).toContain("gpuType=A100");
    expect(calls[0]!.url).toContain("region=us-east");
  });
});

describe("Environments resource", () => {
  it("lists environments", async () => {
    const environments = [
      { id: "e1", name: "main", isDefault: true },
      { id: "e2", name: "staging", isDefault: false },
    ];
    mockFetch([{ body: { data: environments } }]);
    const rc = makeClient();

    const result = await rc.environments.list();
    expect(result).toEqual(environments);
  });

  it("creates an environment", async () => {
    const environment = { id: "e2", name: "staging", isDefault: false };
    const { calls } = mockFetch([{ body: { data: environment } }]);
    const rc = makeClient();

    const result = await rc.environments.create({ name: "staging" });
    expect(result).toEqual(environment);
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.name).toBe("staging");
  });

  it("gets an environment by id", async () => {
    const environment = { id: "e1", name: "main", isDefault: true };
    const { calls } = mockFetch([{ body: { data: environment } }]);
    const rc = makeClient();

    const result = await rc.environments.get("e1");
    expect(result).toEqual(environment);
    expect(calls[0]!.url).toContain("/api/v1/environments/e1");
  });

  it("returns monthly budget fields in camelCase", async () => {
    mockFetch([{
      body: {
        data: {
          id: "e1",
          name: "agents",
          monthly_budget_usd: 500,
          month_to_date_usd: 412.5,
          budget_remaining_usd: 87.5,
        },
      },
    }]);
    const rc = makeClient();

    const result = await rc.environments.get("e1");
    expect(result.monthlyBudgetUsd).toBe(500);
    expect(result.monthToDateUsd).toBe(412.5);
    expect(result.budgetRemainingUsd).toBe(87.5);
  });

  it("updates an environment", async () => {
    const environment = { id: "e2", name: "production", isDefault: false };
    const { calls } = mockFetch([{ body: { data: environment } }]);
    const rc = makeClient();

    const result = await rc.environments.update("e2", { name: "production" });
    expect(result).toEqual(environment);
    expect(calls[0]!.init.method).toBe("PATCH");
  });

  it("deletes an environment", async () => {
    const { calls } = mockFetch([{ status: 204 }]);
    const rc = makeClient();

    await rc.environments.delete("e2");
    expect(calls[0]!.init.method).toBe("DELETE");
    expect(calls[0]!.url).toContain("/api/v1/environments/e2");
  });
});

describe("SSH Keys resource", () => {
  it("lists SSH keys", async () => {
    const keys = [{ id: "k1", name: "laptop", fingerprint: "SHA256:abc" }];
    mockFetch([{ body: { data: keys } }]);
    const rc = makeClient();

    const result = await rc.sshKeys.list();
    expect(result).toEqual(keys);
  });

  it("creates an SSH key", async () => {
    const key = { id: "k1", name: "laptop" };
    const { calls } = mockFetch([{ body: { data: key } }]);
    const rc = makeClient();

    const result = await rc.sshKeys.create({
      name: "laptop",
      publicKey: "ssh-ed25519 AAAA...",
    });
    expect(result).toEqual(key);
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.public_key).toBe("ssh-ed25519 AAAA...");
  });

  it("deletes an SSH key", async () => {
    const { calls } = mockFetch([{ status: 204 }]);
    const rc = makeClient();

    await rc.sshKeys.delete("k1");
    expect(calls[0]!.init.method).toBe("DELETE");
    expect(calls[0]!.url).toContain("/api/v1/ssh-keys/k1");
  });
});

describe("Storage resource", () => {
  it("lists storage volumes", async () => {
    const volumes = [{ id: "v1", name: "datasets", sizeGb: 100 }];
    mockFetch([{ body: { data: volumes } }]);
    const rc = makeClient();

    const result = await rc.storage.list();
    expect(result).toEqual(volumes);
  });

  it("lists storage with search", async () => {
    const { calls } = mockFetch([{ body: { data: [] } }]);
    const rc = makeClient();

    await rc.storage.list({ search: "data" });
    expect(calls[0]!.url).toContain("search=data");
  });

  it("gets a storage volume by id", async () => {
    const volume = { id: "v1", name: "datasets", sizeGb: 100, status: "attached" };
    const { calls } = mockFetch([{ body: { data: volume } }]);
    const rc = makeClient();

    const result = await rc.storage.get("v1");
    expect(result).toEqual(volume);
    expect(calls[0]!.url).toContain("/api/v1/storage/v1");
  });

  it("lists storage regions", async () => {
    const regions = [
      { id: "137", name: "us-east-1", provider: "aws-s3" },
      { id: "21", name: "us-west-1", provider: "wasabi" },
    ];
    const { calls } = mockFetch([{ body: { data: regions } }]);
    const rc = makeClient();

    const result = await rc.storage.listRegions();
    expect(result).toEqual(regions);
    expect(calls[0]!.url).toContain("/api/v1/storage/regions");
  });

  it("creates a storage volume", async () => {
    const created = { id: "v1", name: "datasets", sizeGb: 100, status: "active", region: "137" };
    const { calls } = mockFetch([{ body: { data: created } }]);
    const rc = makeClient();

    const result = await rc.storage.create({ name: "datasets", sizeGb: 100, region: "us-east-1" });
    expect(result).toEqual(created);
    expect(calls[0]!.init.method).toBe("POST");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.name).toBe("datasets");
    expect(body.size_gb).toBe(100);
    expect(body.region).toBe("us-east-1");
  });

  it("resizes a storage volume", async () => {
    const updated = { id: "v1", name: "datasets", sizeGb: 200, status: "active" };
    const { calls } = mockFetch([{ body: { data: updated } }]);
    const rc = makeClient();

    const result = await rc.storage.resize("v1", 200);
    expect(result).toEqual(updated);
    expect(calls[0]!.init.method).toBe("PATCH");
    expect(calls[0]!.url).toContain("/api/v1/storage/v1");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.size_gb).toBe(200);
  });

  it("deletes a storage volume", async () => {
    const deleteResult = { message: "Storage volume deleted successfully", refundAmount: 0.42 };
    const { calls } = mockFetch([{ body: { data: deleteResult } }]);
    const rc = makeClient();

    const result = await rc.storage.delete("v1");
    expect(result).toEqual(deleteResult);
    expect(calls[0]!.init.method).toBe("DELETE");
    expect(calls[0]!.url).toContain("/api/v1/storage/v1");
  });
});

/** The idempotency_key a request sent in its JSON body. */
function sentKey(init: RequestInit): unknown {
  const body: unknown = JSON.parse(String(init.body));
  return body && typeof body === "object" && "idempotency_key" in body ? body.idempotency_key : undefined;
}

describe("Billing resource", () => {
  it("gets balance with runway", async () => {
    mockFetch([{
      body: {
        data: {
          creditsBalance: 50.0,
          activeUsageCost: 2.5,
          floating_balance_usd: 47.5,
          burn_usd_per_hour: 2.5,
          runway_hours: 19,
        },
      },
    }]);
    const rc = makeClient();

    const result = await rc.billing.getBalance();
    expect(result).toEqual({
      creditsBalance: 50.0,
      activeUsageCost: 2.5,
      floatingBalanceUsd: 47.5,
      burnUsdPerHour: 2.5,
      runwayHours: 19,
    });
  });

  it("tops up with the given idempotency key", async () => {
    const { calls } = mockFetch([{
      body: {
        data: {
          id: "tu1",
          status: "succeeded",
          amount_usd: 50,
          idempotency_key: "job-42",
          invoice_number: "RC-000123",
          balance_usd: 104.12,
          created_at: "2026-10-26T10:00:00Z",
        },
      },
    }]);
    const rc = makeClient();

    const result = await rc.billing.topUp({ amountUsd: 50, idempotencyKey: "job-42" });
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.url).toContain("/api/v1/billing/topups");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ amount_usd: 50, idempotency_key: "job-42" });
    expect(result).toMatchObject({
      status: "succeeded",
      amountUsd: 50,
      idempotencyKey: "job-42",
      invoiceNumber: "RC-000123",
      balanceUsd: 104.12,
    });
  });

  it("makes an idempotency key when none is given and returns it", async () => {
    const calls: RequestInit[] = [];
    // Answers with whatever key was sent, as the API echoes it.
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(init);
      return new Response(JSON.stringify({
        data: {
          id: "tu2",
          status: "requires_action",
          amount_usd: 20,
          idempotency_key: sentKey(init),
          invoice_number: null,
          confirm_url: "https://www.runcrate.ai/dashboard/billing?action=confirm-top-up",
          expires_at: "2026-10-27T10:00:00Z",
          created_at: "2026-10-26T10:00:00Z",
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const rc = makeClient();

    const first = await rc.billing.topUp({ amountUsd: 20 });
    const second = await rc.billing.topUp({ amountUsd: 20 });
    const key = sentKey(calls[0]!);
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first.idempotencyKey).toBe(key);
    expect(first.status).toBe("requires_action");
    expect(first.confirmUrl).toContain("confirm-top-up");
    // Each call is a new top-up, so each gets its own key.
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("retries a top-up with the same idempotency key", async () => {
    const { calls } = mockFetch([
      { status: 503, body: { error: { code: "service_unavailable", message: "busy" } } },
      { body: { data: { id: "tu3", status: "processing", amount_usd: 30, idempotency_key: "k", invoice_number: null, created_at: "2026-10-26T10:00:00Z" } } },
    ]);
    const rc = new Runcrate({ apiKey: TEST_API_KEY, maxRetries: 1 });

    const result = await rc.billing.topUp({ amountUsd: 30 });
    expect(calls).toHaveLength(2);
    expect(sentKey(calls[1]!.init)).toBe(sentKey(calls[0]!.init));
    expect(typeof sentKey(calls[0]!.init)).toBe("string");
    expect(result.status).toBe("processing");
  });

  it("gets auto-recharge", async () => {
    mockFetch([{
      body: { data: { enabled: true, threshold_usd: 20, target_usd: 100, last_failure_reason: null, last_failure_at: null } },
    }]);
    const rc = makeClient();

    const result = await rc.billing.getAutoRecharge();
    expect(result).toEqual({ enabled: true, thresholdUsd: 20, targetUsd: 100, lastFailureReason: null, lastFailureAt: null });
  });

  it("sets auto-recharge with a PUT of threshold_usd and target_usd", async () => {
    const { calls } = mockFetch([{
      body: { data: { enabled: false, threshold_usd: 25, target_usd: 200, last_failure_reason: null, last_failure_at: null } },
    }]);
    const rc = makeClient();

    const result = await rc.billing.setAutoRecharge({ enabled: false, thresholdUsd: 25, targetUsd: 200 });
    expect(calls[0]!.init.method).toBe("PUT");
    expect(calls[0]!.url).toContain("/api/v1/billing/auto-recharge");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ enabled: false, threshold_usd: 25, target_usd: 200 });
    expect(result.thresholdUsd).toBe(25);
    expect(result.targetUsd).toBe(200);
  });

  it("lists payment methods camelCased", async () => {
    mockFetch([{
      body: { data: [{ type: "card", brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030, default: true }] },
    }]);
    const rc = makeClient();

    const result = await rc.billing.listPaymentMethods();
    expect(result).toEqual([{ type: "card", brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, default: true }]);
  });

  it("lists transactions with pagination", async () => {
    const txns = [
      { id: "t1", type: "credit", amount: 50.0 },
      { id: "t2", type: "debit", amount: -2.5 },
    ];
    const { calls } = mockFetch([{
      body: {
        data: txns,
        meta: { hasMore: true, total: 100 },
      },
    }]);
    const rc = makeClient();

    const result = await rc.billing.listTransactions({ limit: 2, offset: 0, type: "credit" });
    expect(result.data).toEqual(txns);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(100);
    expect(calls[0]!.url).toContain("limit=2");
    expect(calls[0]!.url).toContain("type=credit");
  });

  it("gets usage summary", async () => {
    const usage = { totalRequests: 500, totalTokens: 100000, totalCost: 5.0 };
    const { calls } = mockFetch([{ body: { data: usage } }]);
    const rc = makeClient();

    const result = await rc.billing.usage({ from: "2025-01-01", to: "2025-01-31" });
    expect(result).toEqual(usage);
    expect(calls[0]!.url).toContain("from=2025-01-01");
    expect(calls[0]!.url).toContain("to=2025-01-31");
  });
});

describe("Templates resource", () => {
  it("lists templates with pagination", async () => {
    const templates = [
      { id: "tpl1", name: "Ubuntu CUDA", category: "ml" },
      { id: "tpl2", name: "PyTorch", category: "ml" },
    ];
    const { calls } = mockFetch([{
      body: {
        data: templates,
        meta: { hasMore: false, total: 2 },
      },
    }]);
    const rc = makeClient();

    const result = await rc.templates.list({
      search: "pytorch",
      category: "ml",
      page: 1,
      pageSize: 10,
    });
    expect(result.data).toEqual(templates);
    expect(result.hasMore).toBe(false);
    expect(result.total).toBe(2);
    expect(calls[0]!.url).toContain("search=pytorch");
    expect(calls[0]!.url).toContain("category=ml");
  });

  it("uses default pagination params", async () => {
    const { calls } = mockFetch([{ body: { data: [], meta: {} } }]);
    const rc = makeClient();

    await rc.templates.list();
    expect(calls[0]!.url).toContain("page=1");
    expect(calls[0]!.url).toContain("page_size=25");
  });
});

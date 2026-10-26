import { PaginatedResponse } from "../pagination.js";
import { newIdempotencyKey, type Transport } from "../transport.js";
import type {
  AutoRecharge,
  Balance,
  PaymentMethod,
  SetAutoRechargeParams,
  TopUp,
  TopUpParams,
  Transaction,
  TransactionListParams,
  UsageParams,
  UsageSummary,
} from "../types.js";
import { removeUndefined } from "../util.js";

export class Billing {
  constructor(private readonly transport: Transport) {}

  async getBalance(): Promise<Balance> {
    const { data } = await this.transport.request<Balance>({
      method: "GET",
      path: "/api/v1/billing/balance",
    });
    return data;
  }

  async listTransactions(
    params?: TransactionListParams,
  ): Promise<PaginatedResponse<Transaction>> {
    const queryParams = {
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0,
      type: params?.type,
    };
    const { data, meta } = await this.transport.request<Transaction[]>({
      method: "GET",
      path: "/api/v1/billing/transactions",
      params: removeUndefined(queryParams),
    });
    return new PaginatedResponse(data, meta);
  }

  async usage(params?: UsageParams): Promise<UsageSummary> {
    const { data } = await this.transport.request<UsageSummary>({
      method: "GET",
      path: "/api/v1/billing/usage",
      params: params ? removeUndefined(params) : undefined,
    });
    return data;
  }

  /**
   * Adds credit to the balance by charging the workspace's default card. Needs a key with the
   * billing permission. Every outcome answers here, including a decline or a charge that needs
   * a person to confirm it: read `status`. To read a `processing` or `requires_action` top-up
   * again, call this with the same `idempotencyKey` (returned on the result): the same key never
   * charges twice.
   */
  async topUp(params: TopUpParams): Promise<TopUp> {
    const { data } = await this.transport.request<TopUp>({
      method: "POST",
      path: "/api/v1/billing/topups",
      body: {
        amount_usd: params.amountUsd,
        // Made once per call, so a retry of this call sends the same key and charges at most once.
        idempotency_key: params.idempotencyKey ?? newIdempotencyKey(),
      },
      // The route dedupes on the key: sending it again answers the same top-up.
      idempotent: true,
    });
    return data;
  }

  async getAutoRecharge(): Promise<AutoRecharge> {
    const { data } = await this.transport.request<AutoRecharge>({
      method: "GET",
      path: "/api/v1/billing/auto-recharge",
    });
    return data;
  }

  /**
   * Turns auto-recharge on or off. `thresholdUsd` and `targetUsd` are required either way. Needs
   * a key with the billing permission, made by a workspace owner or manager.
   */
  async setAutoRecharge(params: SetAutoRechargeParams): Promise<AutoRecharge> {
    const { data } = await this.transport.request<AutoRecharge>({
      method: "PUT",
      path: "/api/v1/billing/auto-recharge",
      body: {
        enabled: params.enabled,
        threshold_usd: params.thresholdUsd,
        target_usd: params.targetUsd,
      },
    });
    return data;
  }

  /** The workspace's saved cards. Cards are added in the dashboard, never by API. */
  async listPaymentMethods(): Promise<PaymentMethod[]> {
    const { data } = await this.transport.request<PaymentMethod[]>({
      method: "GET",
      path: "/api/v1/billing/payment-methods",
    });
    return data;
  }
}

// ─── Client Config ──────────────────────────────────────────────────────────

export interface RuncrateConfig {
  apiKey?: string;
  baseUrl?: string;
  inferenceUrl?: string;
  timeout?: number;
  maxRetries?: number;
  customHeaders?: Record<string, string>;
  /** Optional environment name. If not set, the workspace's default environment is used. */
  environment?: string;
}

// ─── Shared ─────────────────────────────────────────────────────────────────

export interface ListMeta {
  cursor?: string | null;
  hasMore?: boolean | null;
  total?: number | null;
}

// ─── Instances ──────────────────────────────────────────────────────────────

/** Why an instance stopped. `null` while it is still running or was never stopped. */
export type InstanceStopReason =
  | "user"
  | "max_runtime"
  | "idle"
  | "budget"
  | "low_balance"
  | "failed"
  | "system";

export interface Instance {
  id: string;
  name: string;
  status: string;
  gpuType?: string | null;
  gpuCount?: number | null;
  cpuCores?: number | null;
  memory?: number | null;
  storage?: number | null;
  region?: string | null;
  ip?: string | null;
  osImage?: string | null;
  costPerHour?: number | null;
  deployedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** Minutes after first reaching `running` when the instance is terminated. `null`: no limit. */
  maxRuntimeMinutes?: number | null;
  /** Minutes of GPU utilisation under 5% with nobody connected before termination. `null`: off. */
  idleShutdownMinutes?: number | null;
  /** ISO timestamp when the max runtime limit terminates the instance. `null`: no limit set. */
  autoStopAt?: string | null;
  /** Why the instance stopped. `null` while it has not stopped. */
  stopReason?: InstanceStopReason | null;
  [key: string]: unknown;
}

export interface InstanceCreateParams {
  name: string;
  sshKeyId: string;
  gpuType?: string;
  instanceTypeId?: string;
  region?: string;
  gpuCount?: number;
  cpuCores?: number;
  memory?: number;
  storage?: number;
  template?: string;
  envVars?: Record<string, string>;
  startupCommands?: string[];
  storageId?: string;
  launchScript?: string;
  launchScriptBase64?: string;
  /**
   * Terminate the instance automatically after this many minutes of running.
   * The clock starts when the instance first becomes `running`, and an alert goes out
   * 10 minutes before it stops. Integer from 5 to 10080 (7 days). `null` or omitted: no limit.
   *
   * Recommended for unattended agent work, so a forgotten instance cannot run for days.
   */
  maxRuntimeMinutes?: number | null;
  /**
   * Terminate the instance when GPU utilisation stays under 5% with nobody connected (SSH, web
   * terminal or editor) for this many minutes. Integer from 5 to 1440 (24 hours). GPU instances
   * only. `null` or omitted: off.
   *
   * Recommended for unattended agent work, so an instance that finished its job stops billing.
   */
  idleShutdownMinutes?: number | null;
}

/**
 * A change to a starting or running instance's auto stop. A field left out keeps its value;
 * `null` turns that limit off. Pass at least one.
 */
export interface InstanceUpdateParams {
  /**
   * Total minutes the instance may run, counted from when it started running (5 to 10080). A
   * change never stops it sooner than 2 minutes from now. Extend it before a long job.
   */
  maxRuntimeMinutes?: number | null;
  /**
   * Minutes of GPU utilisation under 5% with nobody connected before termination (5 to 1440).
   * GPU instances launched with idle stop support only.
   */
  idleShutdownMinutes?: number | null;
}

export interface InstanceStatus {
  id: string;
  status: string;
  ip?: string | null;
  [key: string]: unknown;
}

export interface InstanceType {
  id: string;
  gpuType: string;
  gpuCount: number;
  cpuCores: number;
  memoryGb: number;
  storageGb: number;
  region: string;
  deploymentType?: string | null;
  hourlyRate: number;
  [key: string]: unknown;
}

export interface InstanceListParams {
  search?: string;
}

export interface InstanceTypeListParams {
  gpuType?: string;
  region?: string;
  gpuCount?: number;
}

// ─── Schedules ──────────────────────────────────────────────────────────────

/** What a schedule launches. */
export type ScheduleKind = "instance" | "job";

/**
 * Recurring schedules only: `"skip"` (default) skips a run while the previous run is still live,
 * `"allow"` launches anyway.
 */
export type ScheduleOverlap = "skip" | "allow";

/**
 * How the most recent run went. `null` until the schedule first runs. `"credential_revoked"`: the
 * schedule was paused because the API key it runs with was revoked, deactivated or moved, or the
 * agent sign-in it runs with ended.
 */
export type ScheduleRunStatus =
  | "launched"
  | "failed"
  | "skipped_budget"
  | "skipped_overlap"
  | "no_access"
  | "credential_revoked";

/** What a schedule's runs launch with: a person's sign-in, an API key, or an agent sign-in. */
export type ScheduleRunAsCredential = "user" | "api_key" | "agent";

/** A job to run: the same fields as creating a job. */
export interface ScheduleJobSpec {
  /** Shell command to run on the machine. */
  command: string;
  gpuType: string;
  /** Whole minutes from 1 to 1440. The job stops after this long. */
  maxRuntimeMinutes: number;
  gpuCount?: number;
  template?: string;
  image?: string;
  /** Environment variables for the command. Names are sent exactly as given. Write-only. */
  env?: Record<string, string>;
  storageId?: string;
  name?: string;
  region?: string;
}

/** An instance to launch: the same fields as creating an instance, with `maxRuntimeMinutes` required. */
export interface ScheduleInstanceSpec {
  name: string;
  /** Required for a schedule, so a scheduled instance always stops on its own. Whole minutes. */
  maxRuntimeMinutes: number;
  gpuType?: string;
  instanceTypeId?: string;
  gpuCount?: number;
  region?: string;
  template?: string;
  sshKeyId?: string;
  storageId?: string;
  /** Write-only. */
  envVars?: Array<{ key: string; value: string }>;
  startupCommands?: string[];
  launchScript?: string;
  launchScriptBase64?: string;
  cpuCores?: number;
  memory?: number;
  storage?: number;
  idleShutdownMinutes?: number;
}

/** What to launch, discriminated on `kind`. */
export type ScheduleSpec =
  | { kind: "instance"; spec: ScheduleInstanceSpec }
  | { kind: "job"; spec: ScheduleJobSpec };

/** A job spec as returned: env values are never returned, only their names in `envKeys`. */
export type ScheduledJobSpec = Omit<ScheduleJobSpec, "env"> & {
  envKeys?: string[];
  [key: string]: unknown;
};

/** An instance spec as returned: env values are never returned, only their names in `envKeys`. */
export type ScheduledInstanceSpec = Omit<ScheduleInstanceSpec, "envVars"> & {
  envKeys?: string[];
  [key: string]: unknown;
};

interface ScheduleBase {
  id: string;
  /** 1 to 63 characters. */
  name: string;
  environmentId: string;
  /** The user who created the schedule. */
  createdBy: string;
  /**
   * The user each run launches as: whoever created the schedule or last changed its spec or
   * timing, or resumed it.
   */
  runAs: string | null;
  /** What the runs launch with. */
  runAsCredential: ScheduleRunAsCredential;
  /** Read-only here: change it through `spec`. */
  maxRuntimeMinutes: number;
  /** One-off: the time it runs (ISO). `null` for a recurring schedule. */
  runAt: string | null;
  /** Recurring: a 5-field cron expression. `null` for a one-off. */
  cron: string | null;
  /** IANA timezone the cron is read in, `"UTC"` by default. */
  timezone: string;
  overlap: ScheduleOverlap;
  enabled: boolean;
  /** `null` when disabled or a one-off that has already run. */
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: ScheduleRunStatus | null;
  lastError: string | null;
  lastInstanceId: string | null;
  lastJobId: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/** A schedule that launches an instance or runs a job, once or on a cron. */
export type Schedule =
  | (ScheduleBase & { kind: "instance"; spec: ScheduledInstanceSpec })
  | (ScheduleBase & { kind: "job"; spec: ScheduledJobSpec });

/**
 * When a schedule runs: exactly one of `runAt` (once, at least a minute ahead and at most 365 days)
 * or `cron` (recurring, occurrences at least 15 minutes apart).
 */
export type ScheduleTiming =
  | { runAt: string | Date; cron?: never }
  | { cron: string; runAt?: never };

export type CreateScheduleParams = ScheduleSpec &
  ScheduleTiming & {
    /** IANA timezone, e.g. `"Europe/London"`. Default `"UTC"`. */
    timezone?: string;
    overlap?: ScheduleOverlap;
    /** Defaults to the spec's name, or `"<kind>-schedule"`. */
    name?: string;
    enabled?: boolean;
  };

/**
 * Any of these. `runAt` makes the schedule a one-off (clears `cron`), `cron` makes it recurring
 * (clears `runAt`). `spec` replaces the whole spec, so resend env values.
 */
export type UpdateScheduleParams = (
  | { runAt?: never; cron?: never }
  | { runAt: string | Date; cron?: never }
  | { cron: string; runAt?: never }
) & {
  /** `false` pauses, `true` resumes. */
  enabled?: boolean;
  timezone?: string;
  overlap?: ScheduleOverlap;
  name?: string;
  spec?: ScheduleInstanceSpec | ScheduleJobSpec;
};

export interface ScheduleDeleteResult {
  id: string;
  deleted: true;
}

/** The job a run started. */
export interface ScheduledJob {
  id: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

/** What `runNow` started: `instance` for an instance schedule, `job` for a job schedule. */
export interface RunNowResult {
  schedule: Schedule;
  instance?: Instance;
  job?: ScheduledJob;
}

// ─── Environments ───────────────────────────────────────────────────────────

export interface Environment {
  id: string;
  name: string;
  isDefault?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  /**
   * Monthly spend cap for this environment in USD, set by a workspace owner or admin in the
   * dashboard. `null`: no cap. At 100%, launches fail with a 402 `BUDGET_REACHED`, running
   * instances stop and inference calls with this environment's API keys are refused until
   * the month ends or the budget is raised. The API cannot set or change it.
   */
  monthlyBudgetUsd?: number | null;
  /** Spend in this environment for the current UTC month, GPU instances plus inference, in USD. */
  monthToDateUsd?: number;
  /** USD left before the monthly budget is reached. `null` when there is no budget. */
  budgetRemainingUsd?: number | null;
  [key: string]: unknown;
}

export interface EnvironmentCreateParams {
  name: string;
}

export interface EnvironmentUpdateParams {
  name?: string;
  isDefault?: boolean;
}

// ─── Secrets ────────────────────────────────────────────────────────────────

/**
 * A secret set in the environment: an environment variable every instance and job launched
 * there gets. The API returns names only; values are set in the dashboard and never shown.
 * A value given for one launch (`envVars` on an instance, `env` on a scheduled job) wins over a secret
 * of the same name.
 */
export interface Secret {
  /** The variable's name, e.g. `HF_TOKEN`. */
  key: string;
  /** A sensitive secret's value is hidden in the dashboard too, for everyone. */
  sensitive: boolean;
  /** When the value or its settings last changed (ISO 8601). */
  updatedAt: string;
}

// ─── SSH Keys ───────────────────────────────────────────────────────────────

export interface SSHKey {
  id: string;
  name: string;
  fingerprint?: string | null;
  type?: string | null;
  createdAt?: string | null;
  lastUsed?: string | null;
  projectId?: string | null;
  [key: string]: unknown;
}

export interface SSHKeyCreateParams {
  name: string;
  publicKey: string;
  type?: string;
}

// ─── Storage ────────────────────────────────────────────────────────────────

export interface StorageVolume {
  id: string;
  name: string;
  sizeGb?: number | null;
  status?: string | null;
  region?: string | null;
  providerType?: string | null;
  deploymentId?: string | null;
  projectId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
}

export interface StorageListParams {
  search?: string;
}

export interface StorageCreateParams {
  name: string;
  sizeGb: number;
  region: string;
}

export interface StorageDeleteResult {
  message: string;
  refundAmount?: number;
  [key: string]: unknown;
}

export interface StorageRegion {
  id: string;
  name: string;
  provider: string;
  [key: string]: unknown;
}

// ─── Billing ────────────────────────────────────────────────────────────────

export interface Balance {
  creditsBalance: number;
  activeUsageCost: number;
  /** The balance net of what the running instances have cost so far, in USD. */
  floatingBalanceUsd: number;
  /** What the running instances cost together, in USD an hour. */
  burnUsdPerHour: number;
  /** Hours the floating balance lasts at that rate. `null` when nothing runs. */
  runwayHours: number | null;
  [key: string]: unknown;
}

/**
 * Where a top-up stands. `succeeded`: the balance has the credit. `processing`: the payment is
 * on its way; send the same idempotency key again to read it. `requires_action`: a signed-in
 * owner or manager must confirm it at `confirmUrl`; nothing is charged until then.
 * `declined`: nothing was charged (see `reason` and `message`).
 */
export type TopUpStatus = "succeeded" | "processing" | "requires_action" | "declined";

export interface TopUp {
  id: string;
  status: TopUpStatus;
  amountUsd: number;
  /** The key this top-up answers to. Send it again to read the same top-up's current status. */
  idempotencyKey: string;
  invoiceNumber: string | null;
  /** The balance after the credit. Only when `status` is `succeeded`. */
  balanceUsd?: number;
  /** Where a signed-in owner or manager confirms it. Only when `status` is `requires_action`. */
  confirmUrl?: string;
  /** When the confirmation link stops working. Only when `status` is `requires_action`. */
  expiresAt?: string | null;
  /** Why it was declined. Only when `status` is `declined`. */
  reason?: "card_declined" | "payment_blocked" | "authentication_required" | (string & {});
  /** A sentence saying what happened and what to do. Only when `status` is `declined`. */
  message?: string;
  createdAt: string;
}

export interface TopUpParams {
  /** USD to add, 20 to 10,000, in dollars and cents. */
  amountUsd: number;
  /**
   * Makes the top-up safe to send again: the same key answers the same top-up instead of
   * charging twice. When omitted the SDK makes a new one (a UUID) and returns it on the result.
   */
  idempotencyKey?: string;
}

export interface AutoRecharge {
  enabled: boolean;
  /** Recharge when the balance falls below this, in USD. */
  thresholdUsd: number | null;
  /** Recharge back up to this, in USD. */
  targetUsd: number | null;
  lastFailureReason: string | null;
  lastFailureAt: string | null;
}

export interface SetAutoRechargeParams {
  enabled: boolean;
  /** 20 to 5,000 USD. Required even to turn auto-recharge off. */
  thresholdUsd: number;
  /** 50 to 10,000 USD, above `thresholdUsd`. Required even to turn auto-recharge off. */
  targetUsd: number;
}

export interface PaymentMethod {
  type: "card" | (string & {});
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  /** Whether top-ups and auto-recharge charge this one. */
  default: boolean;
}

export interface Transaction {
  id: string;
  projectId?: string | null;
  type?: string | null;
  amount?: number | null;
  description?: string | null;
  createdAt?: string | null;
  [key: string]: unknown;
}

export interface TransactionListParams {
  limit?: number;
  offset?: number;
  type?: string;
}

export interface UsageSummary {
  totalRequests?: number | null;
  totalPromptTokens?: number | null;
  totalCompletionTokens?: number | null;
  totalTokens?: number | null;
  totalCost?: number | null;
  [key: string]: unknown;
}

export interface UsageParams {
  from?: string;
  to?: string;
}

// ─── Templates ──────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  createdAt?: string | null;
  [key: string]: unknown;
}

export interface TemplateListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  sortBy?: string;
  sortDir?: string;
}

// ─── Model Inference ────────────────────────────────────────────────────────

export interface ChatMessage {
  role: string;
  content: string | unknown[];
  name?: string;
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string | string[];
  frequencyPenalty?: number;
  presencePenalty?: number;
  [key: string]: unknown;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finishReason?: string | null;
  [key: string]: unknown;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  [key: string]: unknown;
}

export interface ChatCompletion {
  id: string;
  object: string;
  created?: number | null;
  model: string;
  choices: ChatChoice[];
  usage?: ChatUsage | null;
  [key: string]: unknown;
}

export interface ImageGenerationParams {
  model: string;
  prompt: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  responseFormat?: string;
  numInferenceSteps?: number;
  guidance?: number;
  seed?: number;
  negativePrompt?: string;
  [key: string]: unknown;
}

export interface ImageData {
  url?: string | null;
  b64Json?: string | null;
  revisedPrompt?: string | null;
  [key: string]: unknown;
}

export interface ImageGeneration {
  created?: number | null;
  data: ImageData[];
  [key: string]: unknown;
}

export interface VideoGenerationParams {
  model: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface VideoJob {
  id: string;
  status: string;
  [key: string]: unknown;
}

export interface VideoSaveParams extends VideoGenerationParams {
  pollInterval?: number;
  onStatus?: (job: VideoJob) => void;
}

export interface TTSParams {
  model: string;
  input: string;
  voice?: string;
  responseFormat?: string;
  [key: string]: unknown;
}

export interface TranscribeParams {
  model: string;
  file: Blob | Buffer | ArrayBuffer;
  filename?: string;
  language?: string;
  responseFormat?: string;
  [key: string]: unknown;
}

export interface Transcription {
  text: string;
  duration?: number | null;
  language?: string | null;
  segments?: unknown[] | null;
  [key: string]: unknown;
}

// ─── Jobs ───────────────────────────────────────────────────────────────────

/** `queued`, `starting` and `running` are live; the rest are final. */
export type JobStatus =
  | "queued"
  | "starting"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

/** What a failed attempt is retried on. A machine failure is always retried once `maxRetries` is above 0. */
export type JobRetryOn = "machine_failure" | "nonzero_exit";

/** Which of the job's moments call `webhookUrl`. */
export type JobWebhookEvent = "started" | "finished";

/** Why a queued job waits. */
export type JobQueueReason = "no_capacity" | "budget" | "max_parallel" | "volume_busy";

/** The code to fetch into `/workspace/code` before the command runs there. */
export type JobCode =
  /** A tar.gz sent with `jobs.uploads.upload()`. */
  | { uploadId: string }
  /** A git repository over https; `tokenEnv` names the env variable or secret holding a token for a private one. */
  | { git: { url: string; ref?: string; tokenEnv?: string } };

/** The fields of one job, as `jobs.run()` takes them. */
export interface JobRunParams {
  /** Shell command, run with bash in `/workspace`. At most 64 KB. */
  command: string;
  /**
   * The GPU, e.g. `"A4000"`, or GPUs to try in order, e.g. `["H100", "A100-80GB:2"]` (an entry
   * may carry its count). At most 8.
   */
  gpuType: string | string[];
  /** Whole minutes from 1 to 10080 (7 days); each attempt stops after this long. */
  maxRuntimeMinutes: number;
  /** GPUs per machine, 1 to 8, for entries of `gpuType` without a count. Default 1. */
  gpuCount?: number;
  template?: string;
  /** A container image to run the command in, e.g. `"pytorch/pytorch:latest"`. */
  image?: string;
  /** Environment variables. Names are sent exactly as given. Write-only: a job shows only `envKeys`. */
  env?: Record<string, string>;
  /** A volume mounted at `/workspace`. */
  storageId?: string;
  /** At most 63 characters. Default `job-<first 8 characters of the id>`. */
  name?: string;
  /** Only run in this region (a region id, the start of one such as `us-east`, or a city or country). */
  region?: string;
  /** How long a job may wait for a GPU, 0 to 1440 minutes. Default 30. */
  capacityWaitMinutes?: number;
  /** Retries of a failed attempt, 0 to 10. Default 0. */
  maxRetries?: number;
  retryOn?: JobRetryOn[];
  /** With `retryOn` `nonzero_exit`: only these exit codes (1 to 255) are retried. */
  retryExitCodes?: number[];
  /** Up to 20 `{ key: value }` pairs; keys are 1 to 40 of `a-z 0-9 _ . : -`. Sent and returned as given. */
  tags?: Record<string, string>;
  /** An https URL called with a signed POST when the job finishes (and starts, with `webhookEvents`). */
  webhookUrl?: string;
  webhookEvents?: JobWebhookEvent[];
  code?: JobCode;
  /** Env names (or secrets) holding the registry login for a private `image`. */
  imageRegistryAuth?: { usernameEnv: string; passwordEnv: string };
  /** Run `image` on a machine without the NVIDIA container runtime, with no GPU in the container. */
  allowCpuContainer?: boolean;
}

/** A group of jobs: `count` copies, or one job per `params` entry (merged over `env`). */
export type JobGroupRunParams = JobRunParams & {
  /** How many jobs at most run at once. Default all of them. */
  maxParallel?: number;
} & (
    | { count: number; params?: undefined }
    | { params: Array<Record<string, string>>; count?: number }
  );

/** The fields of a job to change on a rerun; anything left out is the job's own. `env` is merged over the job's. */
export type JobRerunParams = Partial<JobRunParams>;

/** Options of a call that creates jobs. */
export interface JobSubmitOptions {
  /**
   * Makes the submit safe to repeat for 24 hours: the same key with the same request answers the
   * first result. Default: a new key per call, reused on that call's retries.
   */
  idempotencyKey?: string;
}

export interface GpuCandidate {
  gpuType: string;
  gpuCount: number;
}

/** One attempt of a job; a retry starts a new one on a new machine. */
export interface JobAttempt {
  attempt: number;
  /** The machine (an instance) the attempt ran on. */
  deploymentId: string | null;
  status: JobStatus;
  exitCode: number | null;
  error: string | null;
  startedAt: string | null;
  endedAt: string | null;
  costUsd: number | null;
  gpuType: string;
  gpuCount: number;
  region: string | null;
}

/** A job's code as fetched: `ref` is the upload id or the git ref; `sha256` and `commit` once fetched. */
export type JobCodeInfo =
  | { source: "upload"; ref: string; sha256: string | null }
  | { source: "git"; url: string; ref: string | null; sha256: null; commit: string | null };

/** A command run on its own fresh machine, which stops when the command ends. Env values are never in it. */
export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  command: string;
  /** The GPU it runs (or last ran) on; the first candidate until it has had a machine. */
  gpuType: string;
  gpuCount: number;
  /** The GPUs asked for, in the order they are tried. */
  gpuCandidates: GpuCandidate[];
  template: string | null;
  image: string | null;
  envKeys: string[];
  storageId: string | null;
  maxRuntimeMinutes: number;
  capacityWaitMinutes: number;
  queueReason: JobQueueReason | null;
  /** When a queued job is tried next. */
  nextAttemptAt: string | null;
  /** 1-based; above 1 after a retry. */
  attempt: number;
  maxRetries: number;
  retryOn: JobRetryOn[];
  retryExitCodes: number[];
  /** Every attempt, the current one last. */
  attempts: JobAttempt[];
  exitCode: number | null;
  error: string | null;
  /** The machine the current attempt runs on. */
  instanceId: string | null;
  environmentId: string;
  /** As sent: keys are not camelCased. */
  tags: Record<string, string>;
  groupId: string | null;
  /** 0-based place in its group. */
  jobIndex: number;
  rerunOf: string | null;
  /** The callback, shown as its host and the end of its path. */
  webhookUrl: string | null;
  webhookEvents: JobWebhookEvent[];
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  costPerHour: number | null;
  /** Every attempt's machine, added up. */
  costUsd: number | null;
  logBytes: number;
  logsTruncated: boolean;
  code: JobCodeInfo | null;
  allowCpuContainer: boolean;
  imageRegistryAuth: { usernameEnv: string; passwordEnv: string } | null;
  artifactsCount: number;
  gpuUtilAvg: number | null;
  gpuMemPeakMb: number | null;
}

/** A submitted job. `webhookSecret` (to check callback signatures) is only in the answer that created it. */
export type SubmittedJob = Job & { webhookSecret?: string };

/** A group of jobs from `count` or `params`. Its jobs are `jobs.list({ groupId })`. */
export interface JobGroup {
  id: string;
  count: number;
  maxParallel: number;
  /** How many of its jobs are in each status (keys as the API sends them, e.g. `timed_out`). */
  statusCounts: Record<JobStatus, number>;
  costUsd: number | null;
  createdAt: string;
}

/** A submitted group with its jobs. */
export type SubmittedJobGroup = JobGroup & { jobs: Job[]; webhookSecret?: string };

export interface JobListParams {
  /** Only jobs in these statuses. */
  status?: JobStatus | JobStatus[];
  /** Only jobs with every one of these tags. */
  tags?: Record<string, string>;
  /** Only the jobs of this group. */
  groupId?: string;
  /** Only jobs whose name contains this. */
  q?: string;
  /** Only jobs that ran (or run) on this GPU. */
  gpuType?: string;
  /** Only jobs created at or after this time. */
  createdAfter?: Date | string;
  /** 1 to 100. Default 20. */
  limit?: number;
  /** `cursor` of the previous page. */
  cursor?: string;
}

/** A fragment of a job's combined stdout and stderr. `seq` and `ts` are null on a marker where output was dropped. */
export interface JobLogChunk {
  seq: number | null;
  ts: string | null;
  text: string;
}

/** One page of a job's output. Pass `cursor` back as `after`; `done` once the job ended and every chunk was read. */
export interface JobLogs {
  jobId: string;
  status: JobStatus;
  chunks: JobLogChunk[];
  cursor: number;
  truncated: boolean;
  done: boolean;
}

export interface JobLogsParams {
  /** The `cursor` of the last page. Default 0, the start. */
  after?: number;
  /** 1 to 1000 chunks. Default 500. */
  limit?: number;
  /** Wait up to 25 seconds for output (or the end) when there is none yet. */
  follow?: boolean;
}

/** A moment in a job's life: `created`, `queued`, `launch_attempt`, `machine_up`, `started`, `exited`, `retrying`, `artifacts_uploaded`, `stopped` and others. */
export interface JobEvent {
  at: string;
  kind: string;
  detail: string | null;
  /** The attempt it belongs to; null for a moment of the machine rather than of one attempt. */
  attempt: number | null;
}

/** GPU use over one step while the command ran: `util` the average percent, memory its peak. */
export interface JobMetricPoint {
  at: string;
  gpus: Array<{ util: number; memUsedMb: number; memTotalMb: number }>;
}

/** A file the command wrote to `$RUNCRATE_OUTPUT_DIR`, kept 30 days after the job ended. */
export interface JobArtifact {
  path: string;
  bytes: number;
  sha256: string;
}

/** Somewhere to PUT a job's code. Submit it with `code: { uploadId }` before `expiresAt`. */
export interface JobUpload {
  uploadId: string;
  /** PUT the tar.gz here; null when a job already uses this upload (nothing to send). */
  url: string | null;
  urlExpiresAt: string | null;
  expiresAt: string;
  maxBytes: number;
}

export interface JobWaitOptions {
  /** Seconds to wait at most; a `JobWaitTimeoutError` then. Default: until the job ends. */
  timeout?: number;
  /** Seconds between the first polls. Default 2. */
  pollInterval?: number;
  /** The longest gap between polls, in seconds; the gap doubles up to it. Default 30. */
  maxPollInterval?: number;
}

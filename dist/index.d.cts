interface RuncrateConfig {
    apiKey?: string;
    baseUrl?: string;
    inferenceUrl?: string;
    timeout?: number;
    maxRetries?: number;
    customHeaders?: Record<string, string>;
    /** Optional environment name. If not set, the workspace's default environment is used. */
    environment?: string;
}
interface ListMeta {
    cursor?: string | null;
    hasMore?: boolean | null;
    total?: number | null;
}
/** Why an instance stopped. `null` while it is still running or was never stopped. */
type InstanceStopReason = "user" | "max_runtime" | "idle" | "budget" | "low_balance" | "failed" | "system";
interface Instance {
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
interface InstanceCreateParams {
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
interface InstanceUpdateParams {
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
interface InstanceStatus {
    id: string;
    status: string;
    ip?: string | null;
    [key: string]: unknown;
}
interface InstanceType {
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
interface InstanceListParams {
    search?: string;
}
interface InstanceTypeListParams {
    gpuType?: string;
    region?: string;
    gpuCount?: number;
}
/** What a schedule launches. */
type ScheduleKind = "instance" | "job";
/**
 * Recurring schedules only: `"skip"` (default) skips a run while the previous run is still live,
 * `"allow"` launches anyway.
 */
type ScheduleOverlap = "skip" | "allow";
/**
 * How the most recent run went. `null` until the schedule first runs. `"credential_revoked"`: the
 * schedule was paused because the API key it runs with was revoked, deactivated or moved, or the
 * agent sign-in it runs with ended.
 */
type ScheduleRunStatus = "launched" | "failed" | "skipped_budget" | "skipped_overlap" | "no_access" | "credential_revoked";
/** What a schedule's runs launch with: a person's sign-in, an API key, or an agent sign-in. */
type ScheduleRunAsCredential = "user" | "api_key" | "agent";
/** A job to run: the same fields as creating a job. */
interface ScheduleJobSpec {
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
interface ScheduleInstanceSpec {
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
    envVars?: Array<{
        key: string;
        value: string;
    }>;
    startupCommands?: string[];
    launchScript?: string;
    launchScriptBase64?: string;
    cpuCores?: number;
    memory?: number;
    storage?: number;
    idleShutdownMinutes?: number;
}
/** What to launch, discriminated on `kind`. */
type ScheduleSpec = {
    kind: "instance";
    spec: ScheduleInstanceSpec;
} | {
    kind: "job";
    spec: ScheduleJobSpec;
};
/** A job spec as returned: env values are never returned, only their names in `envKeys`. */
type ScheduledJobSpec = Omit<ScheduleJobSpec, "env"> & {
    envKeys?: string[];
    [key: string]: unknown;
};
/** An instance spec as returned: env values are never returned, only their names in `envKeys`. */
type ScheduledInstanceSpec = Omit<ScheduleInstanceSpec, "envVars"> & {
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
type Schedule = (ScheduleBase & {
    kind: "instance";
    spec: ScheduledInstanceSpec;
}) | (ScheduleBase & {
    kind: "job";
    spec: ScheduledJobSpec;
});
/**
 * When a schedule runs: exactly one of `runAt` (once, at least a minute ahead and at most 365 days)
 * or `cron` (recurring, occurrences at least 15 minutes apart).
 */
type ScheduleTiming = {
    runAt: string | Date;
    cron?: never;
} | {
    cron: string;
    runAt?: never;
};
type CreateScheduleParams = ScheduleSpec & ScheduleTiming & {
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
type UpdateScheduleParams = ({
    runAt?: never;
    cron?: never;
} | {
    runAt: string | Date;
    cron?: never;
} | {
    cron: string;
    runAt?: never;
}) & {
    /** `false` pauses, `true` resumes. */
    enabled?: boolean;
    timezone?: string;
    overlap?: ScheduleOverlap;
    name?: string;
    spec?: ScheduleInstanceSpec | ScheduleJobSpec;
};
interface ScheduleDeleteResult {
    id: string;
    deleted: true;
}
/** The job a run started. */
interface ScheduledJob {
    id: string;
    name: string;
    status: string;
    [key: string]: unknown;
}
/** What `runNow` started: `instance` for an instance schedule, `job` for a job schedule. */
interface RunNowResult {
    schedule: Schedule;
    instance?: Instance;
    job?: ScheduledJob;
}
interface Environment {
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
interface EnvironmentCreateParams {
    name: string;
}
interface EnvironmentUpdateParams {
    name?: string;
    isDefault?: boolean;
}
/**
 * A secret set in the environment: an environment variable every instance and job launched
 * there gets. The API returns names only; values are set in the dashboard and never shown.
 * A value given for one launch (`envVars` on an instance, `env` on a scheduled job) wins over a secret
 * of the same name.
 */
interface Secret {
    /** The variable's name, e.g. `HF_TOKEN`. */
    key: string;
    /** A sensitive secret's value is hidden in the dashboard too, for everyone. */
    sensitive: boolean;
    /** When the value or its settings last changed (ISO 8601). */
    updatedAt: string;
}
interface SSHKey {
    id: string;
    name: string;
    fingerprint?: string | null;
    type?: string | null;
    createdAt?: string | null;
    lastUsed?: string | null;
    projectId?: string | null;
    [key: string]: unknown;
}
interface SSHKeyCreateParams {
    name: string;
    publicKey: string;
    type?: string;
}
interface StorageVolume {
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
interface StorageListParams {
    search?: string;
}
interface StorageCreateParams {
    name: string;
    sizeGb: number;
    region: string;
}
interface StorageDeleteResult {
    message: string;
    refundAmount?: number;
    [key: string]: unknown;
}
interface StorageRegion {
    id: string;
    name: string;
    provider: string;
    [key: string]: unknown;
}
interface Balance {
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
type TopUpStatus = "succeeded" | "processing" | "requires_action" | "declined";
interface TopUp {
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
interface TopUpParams {
    /** USD to add, 20 to 10,000, in dollars and cents. */
    amountUsd: number;
    /**
     * Makes the top-up safe to send again: the same key answers the same top-up instead of
     * charging twice. When omitted the SDK makes a new one (a UUID) and returns it on the result.
     */
    idempotencyKey?: string;
}
interface AutoRecharge {
    enabled: boolean;
    /** Recharge when the balance falls below this, in USD. */
    thresholdUsd: number | null;
    /** Recharge back up to this, in USD. */
    targetUsd: number | null;
    lastFailureReason: string | null;
    lastFailureAt: string | null;
}
interface SetAutoRechargeParams {
    enabled: boolean;
    /** 20 to 5,000 USD. Required even to turn auto-recharge off. */
    thresholdUsd: number;
    /** 50 to 10,000 USD, above `thresholdUsd`. Required even to turn auto-recharge off. */
    targetUsd: number;
}
interface PaymentMethod {
    type: "card" | (string & {});
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    /** Whether top-ups and auto-recharge charge this one. */
    default: boolean;
}
interface Transaction {
    id: string;
    projectId?: string | null;
    type?: string | null;
    amount?: number | null;
    description?: string | null;
    createdAt?: string | null;
    [key: string]: unknown;
}
interface TransactionListParams {
    limit?: number;
    offset?: number;
    type?: string;
}
interface UsageSummary {
    totalRequests?: number | null;
    totalPromptTokens?: number | null;
    totalCompletionTokens?: number | null;
    totalTokens?: number | null;
    totalCost?: number | null;
    [key: string]: unknown;
}
interface UsageParams {
    from?: string;
    to?: string;
}
interface Template {
    id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    createdAt?: string | null;
    [key: string]: unknown;
}
interface TemplateListParams {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: string;
    sortBy?: string;
    sortDir?: string;
}
interface ChatMessage {
    role: string;
    content: string | unknown[];
    name?: string;
}
interface ChatCompletionParams {
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
interface ChatChoice {
    index: number;
    message: ChatMessage;
    finishReason?: string | null;
    [key: string]: unknown;
}
interface ChatUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    [key: string]: unknown;
}
interface ChatCompletion {
    id: string;
    object: string;
    created?: number | null;
    model: string;
    choices: ChatChoice[];
    usage?: ChatUsage | null;
    [key: string]: unknown;
}
interface ImageGenerationParams {
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
interface ImageData {
    url?: string | null;
    b64Json?: string | null;
    revisedPrompt?: string | null;
    [key: string]: unknown;
}
interface ImageGeneration {
    created?: number | null;
    data: ImageData[];
    [key: string]: unknown;
}
interface VideoGenerationParams {
    model: string;
    prompt: string;
    duration?: number;
    aspectRatio?: string;
    width?: number;
    height?: number;
    [key: string]: unknown;
}
interface VideoJob {
    id: string;
    status: string;
    [key: string]: unknown;
}
interface VideoSaveParams extends VideoGenerationParams {
    pollInterval?: number;
    onStatus?: (job: VideoJob) => void;
}
interface TTSParams {
    model: string;
    input: string;
    voice?: string;
    responseFormat?: string;
    [key: string]: unknown;
}
interface TranscribeParams {
    model: string;
    file: Blob | Buffer | ArrayBuffer;
    filename?: string;
    language?: string;
    responseFormat?: string;
    [key: string]: unknown;
}
interface Transcription {
    text: string;
    duration?: number | null;
    language?: string | null;
    segments?: unknown[] | null;
    [key: string]: unknown;
}
/** `queued`, `starting` and `running` are live; the rest are final. */
type JobStatus = "queued" | "starting" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out";
/** What a failed attempt is retried on. A machine failure is always retried once `maxRetries` is above 0. */
type JobRetryOn = "machine_failure" | "nonzero_exit";
/** Which of the job's moments call `webhookUrl`. */
type JobWebhookEvent = "started" | "finished";
/** Why a queued job waits. */
type JobQueueReason = "no_capacity" | "budget" | "max_parallel" | "volume_busy";
/** The code to fetch into `/workspace/code` before the command runs there. */
type JobCode = 
/** A tar.gz sent with `jobs.uploads.upload()`. */
{
    uploadId: string;
}
/** A git repository over https; `tokenEnv` names the env variable or secret holding a token for a private one. */
 | {
    git: {
        url: string;
        ref?: string;
        tokenEnv?: string;
    };
};
/** The fields of one job, as `jobs.run()` takes them. */
interface JobRunParams {
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
    imageRegistryAuth?: {
        usernameEnv: string;
        passwordEnv: string;
    };
    /** Run `image` on a machine without the NVIDIA container runtime, with no GPU in the container. */
    allowCpuContainer?: boolean;
}
/** A group of jobs: `count` copies, or one job per `params` entry (merged over `env`). */
type JobGroupRunParams = JobRunParams & {
    /** How many jobs at most run at once. Default all of them. */
    maxParallel?: number;
} & ({
    count: number;
    params?: undefined;
} | {
    params: Array<Record<string, string>>;
    count?: number;
});
/** The fields of a job to change on a rerun; anything left out is the job's own. `env` is merged over the job's. */
type JobRerunParams = Partial<JobRunParams>;
/** Options of a call that creates jobs. */
interface JobSubmitOptions {
    /**
     * Makes the submit safe to repeat for 24 hours: the same key with the same request answers the
     * first result. Default: a new key per call, reused on that call's retries.
     */
    idempotencyKey?: string;
}
interface GpuCandidate {
    gpuType: string;
    gpuCount: number;
}
/** One attempt of a job; a retry starts a new one on a new machine. */
interface JobAttempt {
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
type JobCodeInfo = {
    source: "upload";
    ref: string;
    sha256: string | null;
} | {
    source: "git";
    url: string;
    ref: string | null;
    sha256: null;
    commit: string | null;
};
/** A command run on its own fresh machine, which stops when the command ends. Env values are never in it. */
interface Job {
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
    imageRegistryAuth: {
        usernameEnv: string;
        passwordEnv: string;
    } | null;
    artifactsCount: number;
    gpuUtilAvg: number | null;
    gpuMemPeakMb: number | null;
}
/** A submitted job. `webhookSecret` (to check callback signatures) is only in the answer that created it. */
type SubmittedJob = Job & {
    webhookSecret?: string;
};
/** A group of jobs from `count` or `params`. Its jobs are `jobs.list({ groupId })`. */
interface JobGroup {
    id: string;
    count: number;
    maxParallel: number;
    /** How many of its jobs are in each status (keys as the API sends them, e.g. `timed_out`). */
    statusCounts: Record<JobStatus, number>;
    costUsd: number | null;
    createdAt: string;
}
/** A submitted group with its jobs. */
type SubmittedJobGroup = JobGroup & {
    jobs: Job[];
    webhookSecret?: string;
};
interface JobListParams {
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
interface JobLogChunk {
    seq: number | null;
    ts: string | null;
    text: string;
}
/** One page of a job's output. Pass `cursor` back as `after`; `done` once the job ended and every chunk was read. */
interface JobLogs {
    jobId: string;
    status: JobStatus;
    chunks: JobLogChunk[];
    cursor: number;
    truncated: boolean;
    done: boolean;
}
interface JobLogsParams {
    /** The `cursor` of the last page. Default 0, the start. */
    after?: number;
    /** 1 to 1000 chunks. Default 500. */
    limit?: number;
    /** Wait up to 25 seconds for output (or the end) when there is none yet. */
    follow?: boolean;
}
/** A moment in a job's life: `created`, `queued`, `launch_attempt`, `machine_up`, `started`, `exited`, `retrying`, `artifacts_uploaded`, `stopped` and others. */
interface JobEvent {
    at: string;
    kind: string;
    detail: string | null;
    /** The attempt it belongs to; null for a moment of the machine rather than of one attempt. */
    attempt: number | null;
}
/** GPU use over one step while the command ran: `util` the average percent, memory its peak. */
interface JobMetricPoint {
    at: string;
    gpus: Array<{
        util: number;
        memUsedMb: number;
        memTotalMb: number;
    }>;
}
/** A file the command wrote to `$RUNCRATE_OUTPUT_DIR`, kept 30 days after the job ended. */
interface JobArtifact {
    path: string;
    bytes: number;
    sha256: string;
}
/** Somewhere to PUT a job's code. Submit it with `code: { uploadId }` before `expiresAt`. */
interface JobUpload {
    uploadId: string;
    /** PUT the tar.gz here; null when a job already uses this upload (nothing to send). */
    url: string | null;
    urlExpiresAt: string | null;
    expiresAt: string;
    maxBytes: number;
}
interface JobWaitOptions {
    /** Seconds to wait at most; a `JobWaitTimeoutError` then. Default: until the job ends. */
    timeout?: number;
    /** Seconds between the first polls. Default 2. */
    pollInterval?: number;
    /** The longest gap between polls, in seconds; the gap doubles up to it. Default 30. */
    maxPollInterval?: number;
}

interface TransportConfig {
    baseUrl: string;
    apiKey: string;
    timeout: number;
    maxRetries: number;
    customHeaders: Record<string, string>;
    /** Optional environment name. Appended as ?environment=<name> to every request. */
    environment?: string;
    /**
     * Whether a POST is safe to send twice unless a request says otherwise. False for the
     * infrastructure API, where a POST creates or launches something; true for inference.
     */
    postsAreIdempotent?: boolean;
}
interface RequestOptions {
    method: string;
    path: string;
    params?: Record<string, unknown>;
    body?: unknown;
    timeout?: number;
    /** Seconds the request gets at least, whatever the client's timeout (a launch takes a while). */
    minTimeout?: number;
    raw?: boolean;
    noUnwrap?: boolean;
    /**
     * Sent as the Idempotency-Key header, the same on every retry of this call. On a route that
     * honours it, a retry answers the first request's result instead of doing it again.
     */
    idempotencyKey?: string;
    /**
     * Whether sending this request twice is harmless. GET, PATCH, PUT and DELETE are; a POST only
     * when its route dedupes it (an honoured Idempotency-Key, or an action that is the same done
     * twice). A request that is not is never sent again once it may have reached the server (a
     * timeout, a lost connection, a 500, 502 or 504): only a 429 or 503, which say nothing was done,
     * and a connection that never opened are retried.
     */
    idempotent?: boolean;
    /** Response keys whose values are user data (tag names, env names): kept as sent, not camelCased. */
    rawKeys?: readonly string[];
}
interface ApiResponse<T> {
    data: T;
    meta?: ListMeta;
}
declare class Transport {
    private readonly config;
    private readonly headers;
    constructor(config: TransportConfig);
    request<T>(options: RequestOptions): Promise<ApiResponse<T>>;
    /**
     * Where a redirecting GET (an artifact download) points, without following it: the signed URL
     * needs no API key, and the key must not travel to another host.
     */
    redirectLocation(options: Pick<RequestOptions, "path" | "params" | "timeout">): Promise<string>;
    /**
     * Sends the request, retrying what is safe to retry (RequestOptions.idempotent), and answers
     * the last response; throws a TimeoutError or ConnectionError when no response came.
     */
    private send;
    streamRequest(options: Omit<RequestOptions, "raw">): Promise<Response>;
}

declare class Instances {
    private readonly transport;
    constructor(transport: Transport);
    list(params?: InstanceListParams): Promise<Instance[]>;
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
    create(params: InstanceCreateParams): Promise<Instance>;
    get(id: string): Promise<Instance>;
    /**
     * Change a starting or running instance's auto stop, by id or unique name. Returns the instance
     * with its new `autoStopAt`. An out-of-range value throws an `UnprocessableEntityError` (422);
     * a `ConflictError` (409) means the instance is not live, has
     * no GPU for idle stop, or was launched before idle stop existed.
     */
    update(id: string, params: InstanceUpdateParams): Promise<Instance>;
    terminate(id: string): Promise<void>;
    getStatus(id: string): Promise<InstanceStatus>;
    listTypes(params?: InstanceTypeListParams): Promise<InstanceType[]>;
}

declare class Environments {
    private readonly transport;
    constructor(transport: Transport);
    list(): Promise<Environment[]>;
    create(params: EnvironmentCreateParams): Promise<Environment>;
    /**
     * Get an environment, including its monthly budget (`monthlyBudgetUsd`), spend so far this
     * UTC month (`monthToDateUsd`) and what is left (`budgetRemainingUsd`). Budgets are read-only
     * here: a workspace owner or admin sets them in the dashboard.
     */
    get(id: string): Promise<Environment>;
    update(id: string, params: EnvironmentUpdateParams): Promise<Environment>;
    delete(id: string): Promise<void>;
}

declare class SSHKeys {
    private readonly transport;
    constructor(transport: Transport);
    list(): Promise<SSHKey[]>;
    create(params: SSHKeyCreateParams): Promise<SSHKey>;
    delete(id: string): Promise<void>;
}

/**
 * The secrets of the environment the client acts in: environment variables every instance and
 * job launched there gets at boot. Names only: values are set in the Runcrate dashboard
 * (Settings > Secrets) and never returned.
 */
declare class Secrets {
    private readonly transport;
    constructor(transport: Transport);
    /** The secrets set in the environment, sorted by name. Never their values. */
    list(): Promise<Secret[]>;
}

declare class Storage {
    private readonly transport;
    constructor(transport: Transport);
    list(params?: StorageListParams): Promise<StorageVolume[]>;
    get(id: string): Promise<StorageVolume>;
    listRegions(): Promise<StorageRegion[]>;
    create(params: StorageCreateParams): Promise<StorageVolume>;
    resize(id: string, sizeGb: number): Promise<StorageVolume>;
    delete(id: string): Promise<StorageDeleteResult>;
}

declare class PaginatedResponse<T> {
    readonly data: T[];
    readonly meta: ListMeta;
    constructor(data: T[], meta?: ListMeta);
    get hasMore(): boolean;
    get cursor(): string | null | undefined;
    get total(): number | null | undefined;
    [Symbol.iterator](): Iterator<T>;
    get length(): number;
}

declare class Billing {
    private readonly transport;
    constructor(transport: Transport);
    getBalance(): Promise<Balance>;
    listTransactions(params?: TransactionListParams): Promise<PaginatedResponse<Transaction>>;
    usage(params?: UsageParams): Promise<UsageSummary>;
    /**
     * Adds credit to the balance by charging the workspace's default card. Needs a key with the
     * billing permission. Every outcome answers here, including a decline or a charge that needs
     * a person to confirm it: read `status`. To read a `processing` or `requires_action` top-up
     * again, call this with the same `idempotencyKey` (returned on the result): the same key never
     * charges twice. An error thrown here carries the key as `err.idempotencyKey`.
     */
    topUp(params: TopUpParams): Promise<TopUp>;
    getAutoRecharge(): Promise<AutoRecharge>;
    /**
     * Turns auto-recharge on or off. `thresholdUsd` and `targetUsd` are required either way. Needs
     * a key with the billing permission, made by a workspace owner or manager.
     */
    setAutoRecharge(params: SetAutoRechargeParams): Promise<AutoRecharge>;
    /** The workspace's saved cards. Cards are added in the dashboard, never by API. */
    listPaymentMethods(): Promise<PaymentMethod[]>;
}

declare class Templates {
    private readonly transport;
    constructor(transport: Transport);
    list(params?: TemplateListParams): Promise<PaginatedResponse<Template>>;
}

declare class Schedules {
    private readonly transport;
    constructor(transport: Transport);
    /**
     * Schedule an instance launch or a job, once (`runAt`) or on a recurring `cron` in `timezone`.
     * It starts within about 2 minutes of its time, as you, in this environment. Always set
     * `spec.maxRuntimeMinutes`. A bad spec, cron or time throws an `UnprocessableEntityError`
     * (422); more than 50 schedules in the environment or 200 in the workspace throws a
     * `ConflictError` (409).
     */
    create(params: CreateScheduleParams): Promise<Schedule>;
    /** This environment's schedules, newest first. */
    list(): Promise<Schedule[]>;
    get(id: string): Promise<Schedule>;
    /**
     * Pause (`{ enabled: false }`), resume (`{ enabled: true }`), retime, rename or change a
     * schedule. Resuming a one-off whose time has passed, without a new `runAt`, throws a
     * `ConflictError` (409).
     */
    update(id: string, params: UpdateScheduleParams): Promise<Schedule>;
    delete(id: string): Promise<ScheduleDeleteResult>;
    /**
     * Launch a schedule's instance or job now, enabled or not. Does not move `nextRunAt`.
     * A reached environment budget throws an `InsufficientCreditsError` with `code`
     * `"BUDGET_REACHED"`; a low balance, the same error with `code` `"insufficient_credits"`.
     */
    runNow(id: string): Promise<RunNowResult>;
}

declare class Models {
    private readonly transport;
    private readonly inferenceUrl;
    private readonly apiKey;
    constructor(transport: Transport, inferenceUrl: string, apiKey: string);
    chatCompletion(params: ChatCompletionParams & {
        stream: true;
    }): Promise<AsyncGenerator<Record<string, unknown>>>;
    chatCompletion(params: ChatCompletionParams & {
        stream?: false;
    }): Promise<ChatCompletion>;
    chatCompletion(params: ChatCompletionParams): Promise<ChatCompletion | AsyncGenerator<Record<string, unknown>>>;
    generateImage(params: ImageGenerationParams): Promise<ImageGeneration & {
        save(path: string): Promise<void>;
    }>;
    generateVideo(params: VideoGenerationParams): Promise<VideoJob>;
    getVideoStatus(id: string): Promise<VideoJob>;
    downloadVideo(id: string): Promise<Buffer>;
    generateVideoAndSave(path: string, params: VideoSaveParams): Promise<VideoJob>;
    textToSpeech(params: TTSParams): Promise<Buffer>;
    textToSpeechAndSave(path: string, params: TTSParams): Promise<void>;
    transcribe(params: TranscribeParams): Promise<Transcription>;
}

/** Whether a job status is final (`succeeded`, `failed`, `cancelled` or `timed_out`). */
declare function isJobFinished(status: JobStatus): boolean;
/** A job's outputs: the files its command wrote to `$RUNCRATE_OUTPUT_DIR`. */
declare class JobArtifacts {
    private readonly transport;
    constructor(transport: Transport);
    /** The job's outputs by path, kept 30 days after it ended. */
    list(jobId: string): Promise<JobArtifact[]>;
    /** A signed URL that downloads one output, valid for an hour. Needs no API key. */
    url(jobId: string, path: string): Promise<string>;
    /** One output's bytes, in memory. Use `downloadTo` for large files. */
    download(jobId: string, path: string): Promise<Buffer>;
    /** Streams one output to `destination` on disk (the file is replaced). */
    downloadTo(jobId: string, path: string, destination: string): Promise<void>;
}
/** Code uploads: a tar.gz a job unpacks into `/workspace/code`, where its command runs. */
declare class JobUploads {
    private readonly transport;
    constructor(transport: Transport);
    /**
     * Somewhere to PUT a tar.gz of `bytes` (at most 1 GB). With `sha256`, the same archive again
     * answers the same upload. Use `upload()` to do both steps.
     */
    create(params: {
        bytes: number;
        sha256?: string;
    }): Promise<JobUpload>;
    /**
     * Uploads a tar.gz (its bytes, or a path to one) and answers the upload: run a job with
     * `code: { uploadId: upload.uploadId }` within 24 hours. The same archive again is not sent twice.
     */
    upload(archive: Uint8Array | string): Promise<JobUpload>;
}
/**
 * Jobs: a command run on its own fresh GPU machine, which stops (and stops billing) when the
 * command ends. Every submit carries an Idempotency-Key, so its retries never start a second job.
 */
declare class Jobs {
    private readonly transport;
    readonly artifacts: JobArtifacts;
    readonly uploads: JobUploads;
    constructor(transport: Transport);
    /**
     * Run one job. Answers it queued or starting; `wait()` for the end. A low balance throws an
     * `InsufficientCreditsError`, a reached environment budget the same with `code`
     * `"BUDGET_REACHED"`, a bad field an `UnprocessableEntityError`. For several jobs at once use
     * `runGroup()`.
     */
    run(params: JobRunParams, options?: JobSubmitOptions): Promise<SubmittedJob>;
    /**
     * Run a group of jobs: `count` copies of one, or one per `params` entry (each merged over
     * `env`), at most `maxParallel` at once. Answers the group with its jobs.
     */
    runGroup(params: JobGroupRunParams, options?: JobSubmitOptions): Promise<SubmittedJobGroup>;
    /**
     * Run a job's spec again as a new job (its `rerunOf` set), with its env values. `overrides`
     * changes fields; its `env` is merged over the job's. Only whoever submitted the job can reuse
     * its env values; anyone else must send them.
     */
    rerun(id: string, overrides?: JobRerunParams, options?: JobSubmitOptions): Promise<SubmittedJob>;
    private submit;
    get(id: string): Promise<Job>;
    /** One page of jobs, newest first. Pass `cursor` for the next page, or use `listAll()`. */
    list(params?: JobListParams): Promise<PaginatedResponse<Job>>;
    /** Every job matching `params`, newest first, page by page. */
    listAll(params?: Omit<JobListParams, "cursor">): AsyncGenerator<Job>;
    /** Stops the job's machine; the job becomes `cancelled`. A job that ended otherwise throws a `ConflictError`. */
    cancel(id: string): Promise<Job>;
    /** Deletes a job that ended, with its logs and outputs. A live job throws a `ConflictError`: cancel it first. */
    delete(id: string): Promise<void>;
    /** One page of the job's output after `after`. */
    logs(id: string, params?: JobLogsParams): Promise<JobLogs>;
    /**
     * The job's output as it is written, chunk by chunk, until the job ends and every chunk was
     * read. Starts at `after` (default 0, the start). Stop early with `signal` or by breaking out.
     */
    followLogs(id: string, options?: {
        after?: number;
        signal?: AbortSignal;
    }): AsyncGenerator<JobLogChunk>;
    /** The job's timeline, oldest first. */
    events(id: string): Promise<JobEvent[]>;
    /** GPU use while the command ran, oldest first, one point per `step` seconds (60 to 86400). */
    metrics(id: string, params?: {
        step?: number;
    }): Promise<JobMetricPoint[]>;
    /**
     * Polls the job until it ends (succeeded, failed, cancelled or timed out) and answers it. The
     * gap between polls starts at `pollInterval` and doubles up to `maxPollInterval`. Past
     * `timeout` seconds it throws a `JobWaitTimeoutError` holding the job as last seen; the job
     * keeps running.
     */
    wait(id: string, options?: JobWaitOptions): Promise<Job>;
}
/** Groups of jobs, made by `jobs.runGroup()`. */
declare class JobGroups {
    private readonly transport;
    constructor(transport: Transport);
    get(id: string): Promise<JobGroup>;
    /** Cancels every job of the group that has not ended. */
    cancel(id: string): Promise<JobGroup>;
}

interface ChatCompletionsNamespace {
    create(params: ChatCompletionParams): Promise<ChatCompletion | AsyncGenerator<Record<string, unknown>>>;
}
interface ChatNamespace {
    completions: ChatCompletionsNamespace;
}
interface ImagesNamespace {
    generate(params: ImageGenerationParams): Promise<ImageGeneration & {
        save(path: string): Promise<void>;
    }>;
}
interface SpeechNamespace {
    create(params: TTSParams): Promise<Buffer>;
}
interface TranscriptionsNamespace {
    create(params: TranscribeParams): Promise<Transcription>;
}
interface AudioNamespace {
    speech: SpeechNamespace;
    transcriptions: TranscriptionsNamespace;
}
interface VideosNamespace {
    generate(params: VideoGenerationParams): Promise<VideoJob>;
    getStatus(id: string): Promise<VideoJob>;
    download(id: string): Promise<Buffer>;
    generateAndSave(path: string, params: VideoSaveParams): Promise<VideoJob>;
}
declare class Runcrate {
    readonly instances: Instances;
    readonly environments: Environments;
    readonly sshKeys: SSHKeys;
    /** Names of the environment's secrets; values are set in the dashboard. */
    readonly secrets: Secrets;
    readonly storage: Storage;
    readonly billing: Billing;
    readonly templates: Templates;
    readonly schedules: Schedules;
    /** Commands run on their own fresh GPU machine, with logs, retries and outputs. */
    readonly jobs: Jobs;
    /** Groups of jobs from `jobs.runGroup()`. */
    readonly jobGroups: JobGroups;
    readonly models: Models;
    /** OpenAI-compatible chat namespace: `rc.chat.completions.create(...)` */
    readonly chat: ChatNamespace;
    /** OpenAI-compatible images namespace: `rc.images.generate(...)` */
    readonly images: ImagesNamespace;
    /** OpenAI-compatible audio namespace: `rc.audio.speech.create(...)`, `rc.audio.transcriptions.create(...)` */
    readonly audio: AudioNamespace;
    /** Video namespace: `rc.videos.generate(...)` */
    readonly videos: VideosNamespace;
    constructor(config?: RuncrateConfig);
}

declare class RuncrateError extends Error {
    /**
     * The idempotency key of the call that failed, when it had one (`billing.topUp`). Send the
     * same key again to read or finish that call instead of starting a new one.
     */
    idempotencyKey?: string;
    constructor(message: string);
}
declare class ApiError extends RuncrateError {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: Record<string, unknown>;
    constructor(message: string, statusCode: number, code: string, details?: Record<string, unknown>);
}
declare class BadRequestError extends ApiError {
    constructor(message: string, code: string, details?: Record<string, unknown>);
}
declare class AuthenticationError extends ApiError {
    constructor(message: string, code: string, details?: Record<string, unknown>);
}
/**
 * HTTP 402. `code` tells the cases apart: `"insufficient_credits"` when the workspace balance is
 * too low, `"BUDGET_REACHED"` when a launch hits an environment's monthly budget, and
 * `"budget_exceeded"` when an inference call hits it.
 */
declare class InsufficientCreditsError extends ApiError {
    constructor(message: string, code: string, details?: Record<string, unknown>);
}
declare class PermissionDeniedError extends ApiError {
    constructor(message: string, code: string, details?: Record<string, unknown>);
}
declare class NotFoundError extends ApiError {
    constructor(message: string, code: string, details?: Record<string, unknown>);
}
declare class ConflictError extends ApiError {
    constructor(message: string, code: string, details?: Record<string, unknown>);
}
declare class UnprocessableEntityError extends ApiError {
    constructor(message: string, code: string, details?: Record<string, unknown>);
}
declare class RateLimitError extends ApiError {
    constructor(message: string, code: string, details?: Record<string, unknown>);
}
declare class InternalServerError extends ApiError {
    constructor(message: string, code: string, details?: Record<string, unknown>);
}
declare class ConnectionError extends RuncrateError {
    constructor(message: string);
}
declare class TimeoutError extends RuncrateError {
    constructor(message: string);
}
/** `jobs.wait()` ran out of time before the job ended. `job` is the job as last seen (still live). */
declare class JobWaitTimeoutError extends TimeoutError {
    readonly job: Job;
    constructor(message: string, job: Job);
}

export { ApiError, AuthenticationError, type AutoRecharge, BadRequestError, type Balance, type ChatChoice, type ChatCompletion, type ChatCompletionParams, type ChatMessage, type ChatUsage, ConflictError, ConnectionError, type CreateScheduleParams, type Environment, type EnvironmentCreateParams, type EnvironmentUpdateParams, type GpuCandidate, type ImageData, type ImageGeneration, type ImageGenerationParams, type Instance, type InstanceCreateParams, type InstanceListParams, type InstanceStatus, type InstanceStopReason, type InstanceType, type InstanceTypeListParams, type InstanceUpdateParams, InsufficientCreditsError, InternalServerError, type Job, type JobArtifact, type JobAttempt, type JobCode, type JobCodeInfo, type JobEvent, type JobGroup, type JobGroupRunParams, type JobListParams, type JobLogChunk, type JobLogs, type JobLogsParams, type JobMetricPoint, type JobQueueReason, type JobRerunParams, type JobRetryOn, type JobRunParams, type JobStatus, type JobSubmitOptions, type JobUpload, type JobWaitOptions, JobWaitTimeoutError, type JobWebhookEvent, type ListMeta, NotFoundError, PaginatedResponse, type PaymentMethod, PermissionDeniedError, RateLimitError, type RunNowResult, Runcrate, type RuncrateConfig, RuncrateError, type SSHKey, type SSHKeyCreateParams, type Schedule, type ScheduleDeleteResult, type ScheduleInstanceSpec, type ScheduleJobSpec, type ScheduleKind, type ScheduleOverlap, type ScheduleRunAsCredential, type ScheduleRunStatus, type ScheduleSpec, type ScheduleTiming, type ScheduledInstanceSpec, type ScheduledJob, type ScheduledJobSpec, type Secret, type SetAutoRechargeParams, type StorageListParams, type StorageVolume, type SubmittedJob, type SubmittedJobGroup, type TTSParams, type Template, type TemplateListParams, TimeoutError, type TopUp, type TopUpParams, type TopUpStatus, type Transaction, type TransactionListParams, type TranscribeParams, type Transcription, UnprocessableEntityError, type UpdateScheduleParams, type UsageParams, type UsageSummary, type VideoGenerationParams, type VideoJob, type VideoSaveParams, Runcrate as default, isJobFinished };

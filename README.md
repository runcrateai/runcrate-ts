# [Runcrate](https://runcrate.ai) TypeScript SDK

Official TypeScript/JavaScript SDK for the [Runcrate](https://runcrate.ai) platform. Manage GPU instances and run model inference.

- Zero runtime dependencies — native `fetch`
- ESM + CJS dual output
- Full TypeScript types
- Auto-retry with exponential backoff

## Installation

```bash
npm install @runcrate/sdk
```

## Quick Start

```typescript
import Runcrate from '@runcrate/sdk';

const rc = new Runcrate({ apiKey: 'rc_live_...' });

// List GPU instances
const instances = await rc.instances.list();

// Create an instance
const instance = await rc.instances.create({
  name: 'training-run',
  sshKeyId: 'key_abc123',
  gpuType: 'A100',
  gpuCount: 1,
});

// Check balance
const balance = await rc.billing.getBalance();
console.log(`Credits: $${balance.creditsBalance}`);
```

You can also set the `RUNCRATE_API_KEY` environment variable instead of passing `apiKey`.

## Model Inference

All inference methods hit `api.runcrate.ai`.

### Chat Completions

```typescript
const completion = await rc.models.chatCompletion({
  model: 'deepseek-ai/DeepSeek-V3',
  messages: [{ role: 'user', content: 'Hello!' }],
});
console.log(completion.choices[0].message.content);
```

### Streaming

```typescript
const stream = await rc.models.chatCompletion({
  model: 'deepseek-ai/DeepSeek-V3',
  messages: [{ role: 'user', content: 'Tell me a story' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices?.[0]?.delta?.content ?? '');
}
```

### Image Generation

```typescript
const image = await rc.models.generateImage({
  model: 'black-forest-labs/FLUX.1-schnell',
  prompt: 'A futuristic cityscape at sunset',
  width: 1024,
  height: 768,
});
console.log(image.data[0].url);
```

### Video Generation

```typescript
// Submit and poll until complete, then save to disk
const job = await rc.models.generateVideoAndSave('output.mp4', {
  model: 'google/veo-3.0',
  prompt: 'A drone flying over mountains',
  duration: 8,
  onStatus: (j) => console.log(`Status: ${j.status}`),
});
```

### Text-to-Speech

```typescript
import { writeFile } from 'node:fs/promises';

const audio = await rc.models.textToSpeech({
  model: 'openai/tts-1',
  input: 'Hello from Runcrate!',
  voice: 'alloy',
});
await writeFile('speech.mp3', Buffer.from(audio));
```

### Transcription

```typescript
import { readFile } from 'node:fs/promises';

const audioFile = await readFile('recording.wav');
const result = await rc.models.transcribe({
  model: 'openai/whisper-1',
  file: audioFile,
  filename: 'recording.wav',
});
console.log(result.text);
```

## Infrastructure Management

### Instances

```typescript
const instances = await rc.instances.list();
const instance = await rc.instances.get('instance-id');
const status = await rc.instances.getStatus('instance-id');
await rc.instances.terminate('instance-id');

// Browse available GPU types
const types = await rc.instances.listTypes({ gpuType: 'A100' });
```

### Schedules

Start an instance or a job later: once at a time (`runAt`), or on a recurring 5-field `cron` in an IANA `timezone`. A schedule starts within about 2 minutes of its time, as you, in the environment it was created in. Always set `spec.maxRuntimeMinutes` so every scheduled launch stops on its own.

```typescript
// Every night at 02:00 London time, run a job
const nightly = await rc.schedules.create({
  kind: 'job',
  cron: '0 2 * * *',
  timezone: 'Europe/London',
  name: 'nightly-train',
  spec: {
    command: 'python train.py',
    gpuType: 'H100',
    maxRuntimeMinutes: 120,
    env: { HF_TOKEN: process.env.HF_TOKEN! },
  },
});
console.log(nightly.nextRunAt);

// Once, tomorrow morning, launch an instance
await rc.schedules.create({
  kind: 'instance',
  runAt: new Date('2026-10-21T09:00:00Z'),
  spec: { name: 'eval-box', gpuType: 'A100', maxRuntimeMinutes: 60 },
});

const schedules = await rc.schedules.list();
const schedule = await rc.schedules.get(nightly.id);
await rc.schedules.update(nightly.id, { enabled: false }); // pause
await rc.schedules.update(nightly.id, { enabled: true });  // resume
await rc.schedules.update(nightly.id, { cron: '0 3 * * 1-5' });
const { job } = await rc.schedules.runNow(nightly.id);     // launch now, keeps the schedule
await rc.schedules.delete(nightly.id);
```

Pass exactly one of `runAt` or `cron`. Recurring runs are at least 15 minutes apart, a one-off is at most 365 days ahead, and you can have 50 schedules per environment and 200 per workspace. Env values are write-only: a returned `spec` lists their names in `envKeys`, and an update with a new `spec` replaces the whole spec, so send env values again. `overlap: 'skip'` (the default) skips a recurring run while the previous one is still live. `runNow` throws an `InsufficientCreditsError` with `code` `'BUDGET_REACHED'` when the environment's monthly budget is reached. Each run launches as `runAs`, the person who created the schedule or last changed its spec or timing or resumed it, with `runAsCredential` (`'user'`, `'api_key'` or `'agent'`). If that API key is revoked or the agent sign-in ends, the schedule pauses with `lastStatus` `'credential_revoked'`.

#### Auto-stop for unattended work

When an agent or script launches an instance, give it limits so it stops on its own:

```typescript
const instance = await rc.instances.create({
  name: 'agent-job',
  sshKeyId: 'key_abc123',
  gpuType: 'A100',
  maxRuntimeMinutes: 240,   // terminate 4 hours after it starts running (5 to 10080)
  idleShutdownMinutes: 30,  // terminate after 30 idle minutes (5 to 1440)
});

const current = await rc.instances.get(instance.id);
console.log(current.autoStopAt);  // ISO time the max runtime stops it, or null
console.log(current.stopReason);  // 'max_runtime', 'idle', 'budget', ... or null
```

Change the limits on a running instance, for example to extend before a long job. Max runtime
counts from when it started, so pass the total; a field left out keeps its value and `null`
turns it off:

```typescript
await rc.instances.update(instance.id, { maxRuntimeMinutes: 480, idleShutdownMinutes: null });
```

- `maxRuntimeMinutes`: the clock starts when the instance first becomes running, and an alert goes out 10 minutes before it stops.
- `idleShutdownMinutes`: idle means GPU utilisation under 5% with nobody connected (SSH, web terminal or editor); GPU instances only.
- Omit either one, or pass `null`, for no limit. Values outside the ranges throw an `UnprocessableEntityError` (HTTP 422, `validation_error`).

### Jobs

A job runs one command on its own fresh GPU machine, which stops (and stops billing) when the command ends. Write outputs to `$RUNCRATE_OUTPUT_DIR` and they are kept 30 days.

```typescript
import { basename } from 'node:path';

const job = await rc.jobs.run({
  command: 'python train.py --epochs 3 && cp model.pt $RUNCRATE_OUTPUT_DIR/',
  gpuType: ['A4000', 'L40S'],      // tried in order; an entry may carry its count, 'H100:2'
  maxRuntimeMinutes: 60,           // required, 1 to 10080; each attempt stops after this long
  template: 'ubuntu-train',
  env: { HF_TOKEN: process.env.HF_TOKEN! },
  tags: { project: 'vision' },
  maxRetries: 2,                   // a machine failure is retried; add retryOn: ['nonzero_exit'] for the command's own
  code: { git: { url: 'https://github.com/acme/train', ref: 'main' } },
});

// Stream the output until the job ends
for await (const chunk of rc.jobs.followLogs(job.id)) process.stdout.write(chunk.text);

const done = await rc.jobs.wait(job.id, { timeout: 3600 }); // polls with backoff; JobWaitTimeoutError past the timeout
console.log(done.status, done.exitCode, done.costUsd);

for (const file of await rc.jobs.artifacts.list(job.id)) {
  await rc.jobs.artifacts.downloadTo(job.id, file.path, basename(file.path));
}
```

| Method | What it does |
|---|---|
| `jobs.run(params, { idempotencyKey? })` | Runs one job. |
| `jobs.runGroup({ ...params, count \| params, maxParallel? })` | Runs `count` copies, or one job per `params` entry (each merged over `env`). Answers the group with its jobs. |
| `jobs.get(id)`, `jobs.list({ status, tags, groupId, q, gpuType, createdAfter, limit, cursor })`, `jobs.listAll(filters)` | Reads jobs, newest first. `list` answers one page (`hasMore`, `cursor`); `listAll` pages through. |
| `jobs.cancel(id)`, `jobs.delete(id)` | Cancels a live job; deletes a job that ended, with its logs and outputs. |
| `jobs.rerun(id, overrides?)` | Runs the spec again as a new job, with its env values; `overrides.env` is merged over them. |
| `jobs.logs(id, { after, limit, follow })`, `jobs.followLogs(id, { after, signal })` | One page of output; or every chunk as it is written until the job ends. |
| `jobs.events(id)`, `jobs.metrics(id, { step })` | The timeline (queued, launch attempts, started, exited, ...); GPU use per step. |
| `jobs.wait(id, { timeout, pollInterval, maxPollInterval })` | Polls until the job ends, the gap doubling from 2 s to 30 s. |
| `jobs.artifacts.list(id)`, `.url(id, path)`, `.download(id, path)`, `.downloadTo(id, path, file)` | Outputs; a signed URL valid an hour (the API key never goes to it). |
| `jobs.uploads.upload(tarGzBytesOrPath)` | Sends a tar.gz of your code; run with `code: { uploadId }` within 24 hours. |
| `jobGroups.get(id)`, `jobGroups.cancel(id)` | A group's status counts and cost; cancels its live jobs. |

Every job submit and rerun sends an `Idempotency-Key` (a new one per call, or yours), and its retries reuse it, so a retry after a timeout answers the first job instead of starting a second. Pass your own key to make a submit safe to repeat across processes for 24 hours.

### SSH Keys

```typescript
const keys = await rc.sshKeys.list();
const key = await rc.sshKeys.create({
  name: 'my-laptop',
  publicKey: 'ssh-ed25519 AAAA...',
});
await rc.sshKeys.delete('key-id');
```

### Storage

```typescript
const volumes = await rc.storage.list();
const volume = await rc.storage.get('volume-id');
```

### Environments

```typescript
const environments = await rc.environments.list();
const env = await rc.environments.create({ name: 'staging' });
await rc.environments.update('env-id', { name: 'production' });
await rc.environments.delete('env-id');

// Monthly budget, read-only (null means no cap)
const { monthlyBudgetUsd, monthToDateUsd, budgetRemainingUsd } = await rc.environments.get('env-id');
```

A workspace owner or admin sets an environment's monthly budget in the dashboard, under Workspace settings. The API and this SDK can read it but never set it. At 100% of the budget, launches in that environment fail, running instances stop and inference calls with that environment's API keys are refused until the month ends or the budget is raised.

### Secrets

Secrets are environment variables every instance and job launched in an environment gets, such as `HF_TOKEN`. The SDK lists their names, never their values; a workspace owner or manager sets them in the [dashboard](https://runcrate.ai/dashboard/settings/secrets). A value passed for one launch (`envVars`) wins over the secret of the same name.

```typescript
const secrets = await rc.secrets.list(); // [{ key: 'HF_TOKEN', sensitive: false, updatedAt: '...' }]
const hasToken = secrets.some((s) => s.key === 'HF_TOKEN');
```

### Templates

```typescript
const templates = await rc.templates.list({
  search: 'pytorch',
  category: 'ml',
  page: 1,
  pageSize: 10,
});
console.log(`Found ${templates.total} templates`);
```

### Billing

```typescript
const balance = await rc.billing.getBalance();
// floatingBalanceUsd: the balance net of running instances; burnUsdPerHour; runwayHours (null when nothing runs)
console.log(`$${balance.floatingBalanceUsd} left, about ${balance.runwayHours ?? '∞'} hours`);

const txns = await rc.billing.listTransactions({ limit: 20 });
const usage = await rc.billing.usage({ from: '2025-01-01', to: '2025-01-31' });
```

#### Top-ups and auto-recharge

An agent or program can add credit by charging the workspace's default card. The API key needs the **billing permission**, which a workspace owner or manager turns on (with daily and monthly caps) on the dashboard's API keys page. Cards are added in the dashboard, never by API.

```typescript
const topUp = await rc.billing.topUp({ amountUsd: 50 }); // $20 to $10,000

switch (topUp.status) {
  case 'succeeded':
    console.log(`New balance: $${topUp.balanceUsd}`);
    break;
  case 'requires_action':
    // The bank wants a person to confirm it. Nothing is charged until a signed-in
    // owner or manager opens this link (before topUp.expiresAt).
    console.log(topUp.confirmUrl);
    break;
  case 'processing':
    // On its way: read it again later with the same key.
    break;
  case 'declined':
    console.log(topUp.reason, topUp.message); // nothing was charged
    break;
}

// The same key never charges twice: it answers the same top-up with its current status.
const again = await rc.billing.topUp({ amountUsd: 50, idempotencyKey: topUp.idempotencyKey });
```

Without an `idempotencyKey` the SDK makes a new one (a UUID) for each call and returns it on the result, so keep it to retry or to read a `processing` or `requires_action` top-up. Pass your own (a job id, say) to make the top-up safe across restarts. Retries the SDK makes itself reuse the call's key, and while that top-up is being charged the SDK waits and asks again for its answer. When `topUp` throws (a timeout, a lost connection, any API error), the error carries the key as `err.idempotencyKey`: call `topUp` again with it and the same amount to read what happened, never a new key, which could charge twice.

```typescript
const recharge = await rc.billing.getAutoRecharge();
// { enabled, thresholdUsd, targetUsd, lastFailureReason, lastFailureAt }

// Recharge to $200 whenever the balance falls below $25. Needs the billing permission on
// a key made by an owner or manager; threshold and target are required even to turn it off.
await rc.billing.setAutoRecharge({ enabled: true, thresholdUsd: 25, targetUsd: 200 });

const cards = await rc.billing.listPaymentMethods();
// [{ type: 'card', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030, default: true }]
```

Top-up errors: `PermissionDeniedError` with `code` `BILLING_PERMISSION_REQUIRED` (no billing permission on this key); `InsufficientCreditsError` with `code` `TOPUP_CAP_REACHED` (`details` says which cap, what remains and when it resets), `NO_PAYMENT_METHOD` or `PAYMENT_HOLD`; `ConflictError` with `code` `IDEMPOTENCY_KEY_REUSED` (the key was used for another amount) or `conflict` (that top-up was still being charged after the SDK's retries: send the same key again in a few seconds). Every one carries `idempotencyKey`.

```typescript
try {
  await rc.billing.topUp({ amountUsd: 50 });
} catch (err) {
  if (err instanceof RuncrateError && err.idempotencyKey) {
    // Later: rc.billing.topUp({ amountUsd: 50, idempotencyKey: err.idempotencyKey })
  }
}
```

## Error Handling

```typescript
import {
  NotFoundError,
  RateLimitError,
  AuthenticationError,
  InsufficientCreditsError,
} from '@runcrate/sdk';

try {
  await rc.instances.get('nonexistent');
} catch (err) {
  if (err instanceof NotFoundError) {
    console.log('Instance not found');
  } else if (err instanceof RateLimitError) {
    console.log('Rate limited, retry later');
  } else if (err instanceof AuthenticationError) {
    console.log('Invalid API key');
  }
}

try {
  await rc.instances.create({ name: 'agent-job', sshKeyId: 'key_abc123', gpuType: 'A100' });
} catch (err) {
  if (err instanceof InsufficientCreditsError && err.code === 'BUDGET_REACHED') {
    console.log(err.message); // the environment's monthly budget is used up
  } else if (err instanceof InsufficientCreditsError) {
    console.log('Add credits to keep launching');
  }
}
```

Every API error carries `statusCode`, `code` and `message`. A 402 has `code` `insufficient_credits` when the balance is too low, `BUDGET_REACHED` when a launch hits an environment's monthly budget, and `budget_exceeded` when an inference call hits it.

## Configuration

```typescript
const rc = new Runcrate({
  apiKey: 'rc_live_...',        // or RUNCRATE_API_KEY env var
  baseUrl: 'https://runcrate.ai',      // infrastructure API
  inferenceUrl: 'https://api.runcrate.ai', // model inference API
  timeout: 30,                  // seconds
  maxRetries: 3,                // retry on 429/5xx (Retry-After honoured up to 60s; never a 502 launch_refused)
  customHeaders: {},            // extra headers
});
```

### Retries and launches

Reads, updates and deletes are retried on 429, 5xx, timeouts and lost connections. A request that creates or launches something is never sent twice by accident:

- Job submits and reruns send an `Idempotency-Key`, which the server honours, so they are retried like reads.
- A top-up sends its key (in the body and as `Idempotency-Key`) on every retry of the call, and the server answers the same top-up for the same key, so it is retried like a read and never charges twice. While the first request with the key is still being charged, the SDK waits and asks again.
- Instance, schedule and volume creates also send an `Idempotency-Key`, but those routes do not deduplicate it yet; `schedules.runNow` sends none. Once one of these, or a run-now, may have reached Runcrate (a timeout, a lost connection, a 500, 502 or 504) it is not sent again and the error is thrown: check `instances.list()` before launching again. Only a 429 or 503, which say nothing was launched, and a connection that never opened are retried.
- A launch waits at least 75 seconds (a job submit 135) for its answer, whatever `timeout` is, so the client does not give up while the server is still launching.

## Requirements

- Node.js >= 18 (for native `fetch`)
- TypeScript >= 5.0 (optional, for type checking)


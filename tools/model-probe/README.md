# Model adaptation probes

[中文说明](README_ZH.md)

Development tooling for public directory inspection and controlled OpenRouter cache/reminder experiments. It does not provide a production adapter, certify a model, or replace final runtime acceptance. Model policies and research conclusions belong in `.meta_harness/`.

The tool uses Node's standard library and has no external dependencies or package build. The [automation entry](../../scripts/model-probe.mjs) runs it directly.

```sh
node --test tools/model-probe/tests/*.test.mjs
node scripts/model-probe.mjs catalog --output tmp/model-request-runtime/catalog.json
node scripts/model-probe.mjs run --config tmp/model-request-runtime/probe.json --snapshot tmp/model-request-runtime/catalog.json --credential-file /absolute/path/to/.env --ledger tmp/model-request-runtime/ledger.json --output tmp/model-request-runtime/run-01
```

`catalog` sends only public reads. `run` requires an explicit configuration, credential file, ledger and output location. There are no implicit paid requests, environment credential fallback, redirects or retries. All runs in this delivery must share one ledger. The approved total limit is USD 100; configure a research allocation below that total to preserve funds for final implementation acceptance.

Configuration:

```json
{
  "format": 1,
  "stage": "research",
  "budget": { "limitUsd": "100", "researchLimitUsd": "50" },
  "timeoutMs": 60000,
  "maxResponseBytes": 4000000,
  "probes": [{
    "model": "openai/gpt-6-luna",
    "provider": "openai",
    "prefixLines": 256,
    "maxOutputTokens": 128,
    "repetitions": 3,
    "cache": { "mode": "automatic" }
  }]
}
```

Choose a provider **tag present in the inspected endpoint directory**. Prefix size, output cap, reasoning parameters and explicit-cache TTL must be chosen for the inspected model. Explicit mode requires `cache.ttl`; the tool has no TTL default. This example is not a recommendation for every model. Records contain only synthetic fixture content, request bodies without credentials, raw responses and usage facts.

Reservations use the highest advertised prompt/write/completion tier and a conservative byte bound for fixture input. They are estimates, not actual billing. Price changes or unexpected charges can invalidate estimates; an overrun stops the current run. Missing cost, an interrupted request or an abandoned reservation stops subsequent sends until the external request is reconciled or an explicit budget hold is acknowledged as below. A killed run leaves its exclusive lock; do not delete that lock and rerun without checking the request and ledger.

For an existing `unknown` or `reserved` entry whose actual cost remains unavailable, `acknowledgeBudgetHold` is an explicit maintenance operation. Open the same approved ledger with `{ reconciliation: true }`; provide the existing entry ID, a positive decimal-string hold at least equal to the original estimate, and nonempty audit reason and source. The hold is a **budget allowance, not actual cost and not a guaranteed upper bound**. It leaves `actualUsd` absent and retains the entry's unresolved state. Acknowledgment does not send requests, reconcile billing, change limits or clear a stale lock.

```js
import { openProductionLedger } from './tools/model-probe/src/production-gate.mjs'

const ledger = await openProductionLedger(
  approvedLedgerPath,
  approvedLedgerPath,
  { limitUsd: '100', researchLimitUsd: '50' },
  { reconciliation: true },
)
try {
  await ledger.acknowledgeBudgetHold(existingEntryId, '5', {
    reason: 'Historical receipt unavailable; explicitly approve this budget allowance',
    source: 'Reference to the authorization for this allowance',
  })
} finally {
  await ledger.close()
}
```

Choose the hold from the explicit authorization; `5` above is only an example. The production opener preserves the approved-path, owner-only file and exclusive-lock checks. Ordinary opens and reservations accept unresolved entries only when they have valid acknowledgments for their current state. Each current hold counts once toward total exposure and, for research entries, research exposure; settled entries count their actual cost. Maintenance also includes other unacknowledged entries' estimates when checking an allowance. All sums and comparisons preserve every decimal digit. Excessive holds and reservations are refused before mutation.

Every acknowledgment is appended to `budgetHoldAcknowledgments` with amount, reason, source, request state and timestamp. Revising a hold requires another explicit acknowledgment and retains history. A new unknown cost still throws and blocks subsequent sends until separately acknowledged. A `reserved` entry becoming `unknown` likewise needs a fresh acknowledgment. Invalid persisted acknowledgments cannot bypass the gate.

`settle(id, actualUsd)` for a reserved entry and `reconcile(id, actualUsd, { evidence, sha256 })` in maintenance mode replace the current exposure with the exact actual cost and retain acknowledgment history; the hold is no longer counted. Reconciliation still requires upstream evidence and its SHA-256. An actual cost above the current allowance (or original estimate without a current allowance), or above either budget, is persisted and then reported as an error. Further reservations always check both budgets. There is no automatic zero-cost receipt or refund.

Directory presence, pricing and configured cache fields are not cache-hit evidence. Results preserve `cached_tokens = 0` separately from missing fields. Automatic caching may not expose a write count. Message-role behavior, tools, retry/abort and production lifecycle acceptance require additional experiments beyond this cache/reminder fixture.

For the lifecycle feasibility experiment, import `probeLifecycle` from `src/lifecycle.mjs` and pass `Context` from the installed `@deepseek-ai/cordis` 4.0.4 in `packages/core/kernel-basis/node_modules/`. The experiment uses real effect disposal with simulated invocation owners. It does not verify a production registry, HTTP cancellation or timeout policy.

# @omne-harness-lite/call-accounts

[中文](README_ZH.md)

Pure accounting-value admission and exact decimal evaluation for model responses, tool executions and later cost corrections. Summaries keep known amounts and unknown counts separate, without querying services or mutating original records.

## Workspace use

This is an experimental, private workspace package, currently not published on npm. In a repository checkout, use the [development setup](../../../docs/development.md), build the workspace, and declare `"@omne-harness-lite/call-accounts": "workspace:*"` in the consuming member. Declare other packages imported by an example as direct dependencies too. Import through the public package entry; do not import sibling `src/` paths.

## Public API

| Public API                                         | Purpose                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `judgeAccountValue`, `validate`; `./schema`        | Complete accounting judgment, shape validation and v3 Schema                           |
| `ExactDecimal`                                     | Exact `from`, `add`, `compare`, `isInteger`, `toString`, `toJsonNumber`                |
| `prepareAccountGroup`, `AccountGroup`, `summarize` | Admit a complete owned group before authoritative cost projection                      |
| `effectiveCost`                                    | Apply only the corrections belonging to one explicit model/tool target                 |
| `summarizeUsage`                                   | Sum four model token fields with a known sum and unknown count                         |
| Accounting types                                   | `Usage`, `Cost`, `ToolCallAccount`, `CostCorrection`, trim/frame values and identities |

## Examples

Each TypeScript example is self-contained and uses the built public exports.

### Add decimal amounts without floating-point rounding

```ts
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'

const total = ExactDecimal.from(new LosslessNumber('0.1')).add(
  ExactDecimal.from(new LosslessNumber('0.2')),
)
console.log(total.compare(ExactDecimal.from(new LosslessNumber('0.3')))) // 0
console.log(writeJsonLossless({ cost_usd: total.toJsonNumber() })) // {"cost_usd":0.3}
console.log(judgeAccountValue('Cost', { cost_usd: 'unknown', source: 'upstream_usage' }))
// { rejected: 'unknown_with_source' }
```

### Admit a group and apply a later correction

```ts
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { effectiveCost, prepareAccountGroup, summarize } from '@omne-harness-lite/call-accounts'

const cost = { cost_usd: new LosslessNumber('0.1'), source: 'upstream_usage' } as const
const usage = {
  input_tokens: 10,
  output_tokens: 2,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  source: 'upstream',
} as const
const corrections = [
  {
    sessionLog: 'session_1',
    correction: {
      target: { kind: 'model_response', responseId: 'response_1' },
      cost_usd: new LosslessNumber('0.3'),
      obtainedVia: 'manual',
      at: '2026-09-26T12:00:00Z',
    },
  },
] as const
const admitted = prepareAccountGroup({
  models: [{ responseId: 'response_1', cost, usage }],
  tools: [],
  corrections,
})
if ('rejected' in admitted) throw new Error(admitted.rejected)
const summary = summarize(admitted.ok)
if ('failed' in summary) throw new Error(summary.failed)
console.log(summary.knownSum.toString(), summary.unknownCount) // 0.3 0
const effective = effectiveCost(
  { kind: 'model_response', responseId: 'response_1', cost },
  corrections,
)
if ('ok' in effective)
  console.log(effective.ok.source) // later_correction
else throw new Error('cost evaluation failed')
```

### Summarize model usage without treating unknown as zero

```ts
import { summarizeUsage } from '@omne-harness-lite/call-accounts'

const summary = summarizeUsage([
  {
    responseId: 'response_1',
    usage: {
      input_tokens: 10,
      output_tokens: 2,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      source: 'upstream',
    },
  },
  {
    responseId: 'response_2',
    usage: {
      input_tokens: 'unknown',
      output_tokens: 'unknown',
      cache_read_tokens: 'unknown',
      cache_write_tokens: 'unknown',
      source: 'none',
    },
  },
])
if ('rejected' in summary || 'failed' in summary) throw new Error('usage evaluation failed')
console.log(summary.input_tokens.knownSum.toString()) // 10
console.log(summary.input_tokens.unknownCount) // 1
```

## Boundaries and failures

Admission rejections are `correction_without_target`, `malformed`, `negative_amount`, `unknown_with_source`, `total_not_unknown`, in that order. `validate` alone does not establish cross-field validity. Evaluation distinguishes malformed input from `duplicate_account`, `orphan_correction` and `correction_tie`; these are local evaluator failure names, not a complete runtime read API. Conflicting amounts at the same exact instant are a tie even if a later correction exists.

A cost summary counts authoritative model costs and tool-owned costs. Tool `model_call` items are mirrors; they, tool `total_usd`, and tool usage are excluded from this projection after full admission. The latest unambiguous correction replaces the target's effective amount without rewriting its original record. `effectiveCost` requires corrections for that target only, and tool target matching also uses the caller-supplied session-log key.

`'unknown'` is explicit and is neither zero nor absence. `ExactDecimal` operates on the supplied numeric representation; it cannot restore precision lost before a JavaScript number reached this boundary. Use `LosslessNumber` or the strict JSON reader for exact decimals. `summarizeUsage` handles only model `ResponseId + Usage` inputs and four token fields; it does not prove full group validity. Callers own grouping completeness, session/tenant ownership, persistence, idempotency and every subsequent numeric transport boundary.

## Development

```sh
pnpm --filter @omne-harness-lite/call-accounts run build
pnpm --filter @omne-harness-lite/call-accounts run typecheck
pnpm --filter @omne-harness-lite/call-accounts run test
```

Build workspace dependencies first. These checks cover this package; integration behavior requires the actual consumer and provider.

The default public entry and `./schema` adopt `data.call-accounts/v3`. `./schema/v2` retains the exact normative CA2 bytes for pinned references in the current dependency graph; it has no executable versioned entry. The actual read owner first selects confirmed final, otherwise complete ready facts, for each ResponseId within one authorized Session source prefix, then supplies one explicit model account per response. `summarize` does not query logs, deduplicate CallKey or select ready/final: passing both accounts for one response fails with `duplicate_account`. Corrections still target the original ResponseId; absent late on ready does not establish timeliness. Unknown access, source or ready payload must be resolved by the read owner, without omission or zero substitution.

### Import the current and pinned dependency schemas

```ts
import assert from 'node:assert/strict'
import current from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import pinned from '@omne-harness-lite/call-accounts/schema/v2' with { type: 'json' }
import { schemaId } from '@omne-harness-lite/call-accounts'

assert.equal(schemaId, current.$id)
assert.ok(current.$id.includes('/call-accounts/v3/'))
assert.ok(pinned.$id.includes('/call-accounts/v2/'))
assert.deepEqual(current.$defs, pinned.$defs)
```

Adoption and mapping: [D110](../../../.meta_harness/design/record/decisions/model-runtime-reference-lifecycle-adoption/decision.md), [CA3](../../../.meta_harness/design/spec/data/call-accounts/v3/contract.md), [provider](../../../.meta_harness/design/realization/packages/core/call-accounts/v3-design.md). Verification: [CA3 explicit inputs](tests/v3.spec.ts) and [normative examples](tests/examples.spec.ts). Actual source selection, access and durable recovery remain composition obligations.

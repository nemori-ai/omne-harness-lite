import { isJsonNumber, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from './decimal.ts'
import { judgeAccountValue, amountSum, compareAccountInstants } from './judge.ts'
import { isObject, snapshotJson, validate } from './schema.ts'
import type {
  AccountRejection,
  Amount,
  Cost,
  CostCorrection,
  ResponseId,
  ToolCallAccount,
  Usage,
} from './types.ts'

export interface ModelAccountInput {
  readonly responseId: ResponseId
  readonly cost: Cost
  readonly usage: Usage
}
export interface ModelUsageInput {
  readonly responseId: ResponseId
  readonly usage: Usage
}
export interface ToolAccountInput {
  /** Explicit caller-provided equality key of the containing session log; no lookup. */
  readonly sessionLog: string
  readonly account: ToolCallAccount
}
export interface CorrectionInput {
  readonly sessionLog: string
  readonly correction: CostCorrection
}
export interface AccountGroupInput {
  readonly models: readonly ModelAccountInput[]
  readonly tools: readonly ToolAccountInput[]
  readonly corrections: readonly CorrectionInput[]
}
/** Local candidate names (CA-1/G-10), not a formal Run read-model failure policy. */
export type EvaluationFailure = 'orphan_correction' | 'correction_tie' | 'duplicate_account'
export interface Summary {
  readonly knownSum: ExactDecimal
  readonly unknownCount: number
}
export type SummaryResult = Summary | { readonly failed: EvaluationFailure }
export type UsageField =
  'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'cache_write_tokens'
export type UsageSummary = Readonly<Record<UsageField, Summary>>
export type UsageSummaryResult =
  UsageSummary | { readonly rejected: AccountRejection } | { readonly failed: 'duplicate_account' }
interface Target {
  readonly key: string
  readonly amount: ExactDecimal | 'unknown'
}
interface Correction {
  readonly key: string
  readonly amount: ExactDecimal
  readonly at: string
}
const admissionToken = Symbol('account-group-admission')

/**
 * Admitted snapshot, private projection. Neither total_usd nor mirror items nor
 * tool usage can be supplied to summarize; admission first checks the full values.
 */
export class AccountGroup {
  readonly #targets: readonly Target[]
  readonly #corrections: readonly Correction[]
  private constructor(
    token: symbol,
    targets: readonly Target[],
    corrections: readonly Correction[],
  ) {
    if (token !== admissionToken) throw new TypeError('AccountGroup requires admission')
    this.#targets = Object.freeze(targets)
    this.#corrections = Object.freeze(corrections)
    Object.freeze(this)
  }

  static prepare(
    input: unknown,
  ): { readonly ok: AccountGroup } | { readonly rejected: AccountRejection } {
    const value = snapshotJson(input)
    if (
      !isObject(value) ||
      !keys(value, ['models', 'tools', 'corrections']) ||
      !Array.isArray(value.models) ||
      !Array.isArray(value.tools) ||
      !Array.isArray(value.corrections)
    )
      return rejected('malformed')
    const invalid = preflight(value)
    if (invalid !== undefined) return rejected(invalid)
    const targets: Target[] = []
    const corrections: Correction[] = []
    for (const model of value.models) targets.push(modelTarget(model))
    for (const tool of value.tools) targets.push(toolTarget(tool))
    for (const row of value.corrections) corrections.push(correctionFrom(row))
    return Object.freeze({ ok: new AccountGroup(admissionToken, targets, corrections) })
  }

  static summarize(group: AccountGroup): SummaryResult {
    const prepared = effectiveTargets(group.#targets, group.#corrections)
    if ('failed' in prepared) return prepared
    return sum(prepared.amounts)
  }
}
function modelTarget(model: JsonValue): Target {
  if (!isObject(model)) throw new Error('admitted model lost structure')
  if (
    typeof model.responseId !== 'string' ||
    !isObject(model.cost) ||
    !isObject(model.usage) ||
    (model.cost.cost_usd !== 'unknown' && !isJsonNumber(model.cost.cost_usd))
  )
    throw new Error('admitted model lost fields')
  return Object.freeze({
    key: modelKey(model.responseId),
    amount: decimal(model.cost.cost_usd),
  })
}

function ownToolAmounts(item: JsonValue): readonly Amount[] {
  if (
    !isObject(item) ||
    typeof item.service !== 'string' ||
    (item.cost_usd !== 'unknown' && !isJsonNumber(item.cost_usd))
  )
    throw new Error('admitted cost item lost fields')
  return item.service === 'model_call' ? [] : [item.cost_usd]
}

function toolTarget(tool: JsonValue): Target {
  if (
    !isObject(tool) ||
    !keys(tool, ['sessionLog', 'account']) ||
    typeof tool.sessionLog !== 'string'
  ) {
    throw new Error('admitted tool lost structure')
  }
  if (
    !isObject(tool.account) ||
    typeof tool.account.callId !== 'string' ||
    !isObject(tool.account.cost) ||
    !Array.isArray(tool.account.cost.items)
  )
    throw new Error('admission failed to narrow a tool account')
  const own = tool.account.cost.items.flatMap(ownToolAmounts)
  return Object.freeze({
    key: toolKey(tool.sessionLog, tool.account.callId),
    amount: amountSum(own),
  })
}

function correctionKey(target: JsonObject, sessionLog: string): string {
  const key =
    target.kind === 'model_response' && typeof target.responseId === 'string'
      ? modelKey(target.responseId)
      : target.kind === 'tool_execution' && typeof target.callId === 'string'
        ? toolKey(sessionLog, target.callId)
        : undefined
  if (key === undefined) throw new Error('admission failed to narrow a correction target')
  return key
}

function correctionFrom(row: JsonValue): Correction {
  if (
    !isObject(row) ||
    !keys(row, ['sessionLog', 'correction']) ||
    typeof row.sessionLog !== 'string'
  ) {
    throw new Error('admitted correction lost structure')
  }
  if (
    !isObject(row.correction) ||
    !isObject(row.correction.target) ||
    !isJsonNumber(row.correction.cost_usd) ||
    typeof row.correction.at !== 'string'
  )
    throw new Error('admission failed to narrow a correction')
  const key = correctionKey(row.correction.target, row.sessionLog)
  return Object.freeze({
    key,
    amount: ExactDecimal.from(row.correction.cost_usd),
    at: row.correction.at,
  })
}

export function prepareAccountGroup(
  input: unknown,
): { readonly ok: AccountGroup } | { readonly rejected: AccountRejection } {
  return AccountGroup.prepare(input)
}
export function summarize(group: AccountGroup): SummaryResult {
  return AccountGroup.summarize(group)
}
/** Model-only helper; it does not establish complete account-group validity. */
export function summarizeUsage(models: readonly ModelUsageInput[]): UsageSummaryResult {
  const value = snapshotJson(models)
  if (!Array.isArray(value)) return rejected('malformed')
  const reasons: AccountRejection[] = []
  for (const model of value) {
    if (
      !isObject(model) ||
      !keys(model, ['responseId', 'usage']) ||
      !validate('ResponseId', model.responseId).valid
    ) {
      reasons.push('malformed')
      continue
    }
    const result = judgeAccountValue('Usage', model.usage)
    if ('rejected' in result) reasons.push(result.rejected)
  }
  const invalid = firstRejection(reasons)
  if (invalid !== undefined) return rejected(invalid)
  const ids = new Set(
    value.map(model => {
      if (!isObject(model) || typeof model.responseId !== 'string')
        throw new Error('admitted model usage lost identity')
      return model.responseId
    }),
  )
  if (ids.size !== value.length) return Object.freeze({ failed: 'duplicate_account' as const })
  const admittedModels = value
  function field(name: UsageField): Summary {
    return sum(
      admittedModels.map(model => {
        if (!isObject(model) || !isObject(model.usage))
          throw new Error('admitted model usage lost structure')
        const item = model.usage[name]
        if (!isJsonNumber(item) && item !== 'unknown')
          throw new Error('admitted usage lost a field')
        return decimal(item)
      }),
    )
  }
  return Object.freeze({
    input_tokens: field('input_tokens'),
    output_tokens: field('output_tokens'),
    cache_read_tokens: field('cache_read_tokens'),
    cache_write_tokens: field('cache_write_tokens'),
  })
}

function preflight(value: JsonObject): AccountRejection | undefined {
  if (
    !Array.isArray(value.models) ||
    !Array.isArray(value.tools) ||
    !Array.isArray(value.corrections)
  )
    return 'malformed'
  const reasons: AccountRejection[] = []
  for (const model of value.models) reasons.push(...modelRejections(model))
  for (const tool of value.tools) {
    const invalid = rowRejection(tool, 'ToolCallAccount')
    if (invalid !== undefined) reasons.push(invalid)
  }
  for (const row of value.corrections) {
    const invalid = rowRejection(row, 'CostCorrection')
    if (invalid !== undefined) reasons.push(invalid)
  }
  return firstRejection(reasons)
}
function modelRejections(model: JsonValue): readonly AccountRejection[] {
  if (
    !isObject(model) ||
    !keys(model, ['responseId', 'cost', 'usage']) ||
    !validate('ResponseId', model.responseId).valid
  )
    return ['malformed']
  const reasons: AccountRejection[] = []
  for (const [kind, item] of [
    ['Cost', model.cost],
    ['Usage', model.usage],
  ] as const) {
    const result = judgeAccountValue(kind, item)
    if ('rejected' in result) reasons.push(result.rejected)
  }
  // This input is a recorded original Cost, not a previously derived effective Cost.
  if (isObject(model.cost) && model.cost.source === 'later_correction') reasons.push('malformed')
  return reasons
}
function rowRejection(
  row: JsonValue,
  kind: 'ToolCallAccount' | 'CostCorrection',
): AccountRejection | undefined {
  const field = kind === 'ToolCallAccount' ? 'account' : 'correction'
  if (!isObject(row) || !keys(row, ['sessionLog', field]) || typeof row.sessionLog !== 'string')
    return 'malformed'
  const result = judgeAccountValue(kind, row[field])
  return 'rejected' in result ? result.rejected : undefined
}

function firstRejection(reasons: readonly AccountRejection[]): AccountRejection | undefined {
  // S27 orders faults within one value. This local order only stabilizes multi-value admission.
  const order: readonly AccountRejection[] = [
    'correction_without_target',
    'malformed',
    'negative_amount',
    'unknown_with_source',
    'total_not_unknown',
  ]
  return order.find(reason => reasons.includes(reason))
}

function correctionTie(matching: readonly Correction[]): boolean {
  for (let first = 0; first < matching.length; first++)
    for (let second = first + 1; second < matching.length; second++) {
      const left = matching[first]
      const right = matching[second]
      if (
        left !== undefined &&
        right !== undefined &&
        compareAccountInstants(left.at, right.at) === 0 &&
        left.amount.compare(right.amount) !== 0
      )
        return true
    }
  return false
}

function effectiveTargets(
  targets: readonly Target[],
  corrections: readonly Correction[],
):
  | { readonly amounts: readonly (ExactDecimal | 'unknown')[] }
  | { readonly failed: EvaluationFailure } {
  // No domain precedence is specified for simultaneous failures. This fixed local
  // selection keeps permutations identical; all three remain distinct from unknown.
  const keysSeen = new Set(targets.map(target => target.key))
  if (keysSeen.size !== targets.length) return failed('duplicate_account')
  if (corrections.some(correction => !keysSeen.has(correction.key)))
    return failed('orphan_correction')
  const amounts: (ExactDecimal | 'unknown')[] = []
  for (const target of targets) {
    const matching = corrections.filter(correction => correction.key === target.key)
    // A conflicting equal-at pair is ambiguous even when a later correction exists (S-23 #4).
    if (correctionTie(matching)) return failed('correction_tie')
    let latest: Correction | undefined
    for (const correction of matching)
      if (latest === undefined || compareAccountInstants(correction.at, latest.at) > 0)
        latest = correction
    amounts.push(latest?.amount ?? target.amount)
  }
  return Object.freeze({ amounts: Object.freeze(amounts) })
}
function sum(values: readonly (ExactDecimal | 'unknown')[]): Summary {
  let knownSum = ExactDecimal.from(0)
  let unknownCount = 0
  for (const amount of values)
    if (amount === 'unknown') unknownCount++
    else knownSum = knownSum.add(amount)
  return Object.freeze({ knownSum, unknownCount })
}
function decimal(value: Amount): ExactDecimal | 'unknown' {
  return value === 'unknown' ? value : ExactDecimal.from(value)
}
function modelKey(id: string): string {
  return JSON.stringify(['model_response', id])
}
function toolKey(sessionLog: string, id: string): string {
  return JSON.stringify(['tool_execution', sessionLog, id])
}
function keys(value: JsonObject, expected: readonly string[]): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every(key => Object.hasOwn(value, key))
  )
}
function rejected(reason: AccountRejection): { readonly rejected: AccountRejection } {
  return Object.freeze({ rejected: reason })
}
function failed(reason: EvaluationFailure): { readonly failed: EvaluationFailure } {
  return Object.freeze({ failed: reason })
}

export type ModelCostTarget = {
  readonly kind: 'model_response'
  readonly responseId: ResponseId
  readonly cost: Cost
}
export type ToolCostTarget = {
  readonly kind: 'tool_execution'
  readonly sessionLog: string
  readonly account: ToolCallAccount
}
export type EffectiveCostFailure =
  { readonly rejected: AccountRejection } | { readonly failed: EvaluationFailure }

function singleTargetGroup(ownedTarget: JsonObject, ownedCorrections: readonly JsonValue[]) {
  const emptyUsage: Usage = {
    input_tokens: 'unknown',
    output_tokens: 'unknown',
    cache_read_tokens: 'unknown',
    cache_write_tokens: 'unknown',
    source: 'none',
  }
  return {
    models:
      ownedTarget.kind === 'model_response'
        ? [{ responseId: ownedTarget.responseId, cost: ownedTarget.cost, usage: emptyUsage }]
        : [],
    tools:
      ownedTarget.kind === 'tool_execution'
        ? [{ sessionLog: ownedTarget.sessionLog, account: ownedTarget.account }]
        : [],
    corrections: ownedCorrections,
  }
}

function modelEffectiveCost(
  original: JsonValue | undefined,
  ownedCorrections: readonly JsonValue[],
  amount: Amount,
): { readonly ok: Cost } {
  if (!isObject(original)) throw new Error('admitted model cost lost structure')
  const upstream = original.upstream_inference_cost_usd
  const originalSource = original.source
  if (
    originalSource !== 'none' &&
    originalSource !== 'upstream_usage' &&
    originalSource !== 'later_correction'
  )
    throw new Error('admitted model cost lost source')
  const source = ownedCorrections.length > 0 ? 'later_correction' : originalSource
  const cost: Cost = Object.freeze({
    cost_usd: amount,
    source,
    ...(isJsonNumber(upstream) ? { upstream_inference_cost_usd: upstream } : {}),
  })
  return Object.freeze({ ok: cost })
}

export function effectiveCost(
  target: ModelCostTarget,
  corrections: readonly CorrectionInput[],
): { readonly ok: Cost } | EffectiveCostFailure
export function effectiveCost(
  target: ToolCostTarget,
  corrections: readonly CorrectionInput[],
): { readonly ok: Amount } | EffectiveCostFailure
export function effectiveCost(
  target: ModelCostTarget | ToolCostTarget,
  corrections: readonly CorrectionInput[],
): { readonly ok: Cost | Amount } | EffectiveCostFailure {
  const input = snapshotJson({ target, corrections })
  if (!isObject(input) || !isObject(input.target) || !Array.isArray(input.corrections))
    return rejected('malformed')
  const ownedTarget = input.target
  const ownedCorrections = input.corrections
  if (ownedTarget.kind !== 'model_response' && ownedTarget.kind !== 'tool_execution')
    return rejected('malformed')
  const prepared = prepareAccountGroup(singleTargetGroup(ownedTarget, ownedCorrections))
  if ('rejected' in prepared) return prepared
  const result = summarize(prepared.ok)
  if ('failed' in result) return result
  const amount: Amount = result.unknownCount === 0 ? result.knownSum.toJsonNumber() : 'unknown'
  if (ownedTarget.kind === 'tool_execution') return Object.freeze({ ok: amount })
  return modelEffectiveCost(ownedTarget.cost, ownedCorrections, amount)
}

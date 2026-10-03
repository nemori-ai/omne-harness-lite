import { copyJsonValue, isJsonNumber } from '@omne-harness-lite/content-blocks'
import {
  validate as profileShape,
  judgeModelProfileDocument,
  type ModelProfileSnapshot,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import { validate as toolShape, type ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { start } from '@omne-harness-lite/stream-assembly'
import { ExactDecimal, judgeAccountValue, type Usage } from '@omne-harness-lite/call-accounts'
import { copyInputCalibration } from '@omne-harness-lite/model-response'
import type {
  InputLimitMetric,
  PlanCalibration,
  PlanInput,
  TokenMargin,
  ReplaySelection,
} from './types.ts'
import { copyPlanOutputHistory } from './output-history.ts'
import { copyPlanContentBlocks, copyPlanMessages } from './plan-input-values.ts'

function index(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function calibrationSelectionItem(value: unknown, blockCount: number): value is ReplaySelection {
  return (
    object(value) &&
    Object.keys(value).length === 3 &&
    index(value.sourceBlockIndex) &&
    value.sourceBlockIndex < blockCount &&
    index(value.messageIndex) &&
    index(value.blockIndex)
  )
}

function calibrationSelection(
  values: readonly unknown[],
  blockCount: number,
): ReplaySelection[] | undefined {
  const selection = []
  const targets = new Set<string>()
  for (const item of values) {
    if (!calibrationSelectionItem(item, blockCount)) return undefined
    const key = `${item.messageIndex}:${item.blockIndex}`
    if (targets.has(key)) return undefined
    targets.add(key)
    selection.push({
      sourceBlockIndex: item.sourceBlockIndex,
      messageIndex: item.messageIndex,
      blockIndex: item.blockIndex,
    })
  }
  return selection
}

function noObservation(source: Record<string, unknown>): PlanCalibration | undefined {
  return Object.keys(source).length === 2 &&
    (source.reason === 'no_observation' || source.reason === 'source_unavailable')
    ? { kind: 'none', reason: source.reason }
    : undefined
}

function observationShape(source: Record<string, unknown>): source is Record<string, unknown> & {
  readonly outputBlocks: readonly unknown[]
  readonly replaySelection: readonly unknown[]
} {
  return (
    source.kind === 'observation' &&
    Object.keys(source).length === 5 &&
    Array.isArray(source.outputBlocks) &&
    Array.isArray(source.replaySelection)
  )
}

function calibration(value: unknown): PlanCalibration | undefined {
  const copied = copyJsonValue(value)
  if (!('ok' in copied) || !object(copied.ok)) return undefined
  const source = copied.ok
  if (source.kind === 'none') return noObservation(source)
  if (!observationShape(source)) return undefined
  const owned = copyInputCalibration(source.inputCalibration)
  if (!('ok' in owned) || !('ok' in judgeAccountValue('Usage', source.usage))) return undefined
  const blocks = copyPlanContentBlocks(source.outputBlocks)
  if (blocks === undefined) return undefined
  const selection = calibrationSelection(source.replaySelection, blocks.length)
  if (selection === undefined) return undefined
  return Object.freeze({
    kind: 'observation',
    inputCalibration: owned.ok,
    usage: source.usage as unknown as Usage,
    outputBlocks: Object.freeze(blocks),
    replaySelection: Object.freeze(selection),
  })
}

function snapshot(value: unknown): value is ModelProfileSnapshot {
  return profileShape('ModelProfileSnapshot', value).valid
}
function parameters(value: unknown): value is ModelRequestParameters {
  return 'ok' in judgeModelProfileDocument('ModelRequestParameters', value)
}
function tool(value: unknown): value is ModelToolEntry {
  return toolShape('ModelToolEntry', value).valid
}
function margin(value: unknown): value is TokenMargin {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 2 &&
    'multiplier' in value &&
    isJsonNumber(value.multiplier) &&
    ExactDecimal.from(value.multiplier).compare(ExactDecimal.from(1)) >= 0 &&
    'reserveTokens' in value &&
    isJsonNumber(value.reserveTokens) &&
    ExactDecimal.from(value.reserveTokens).isInteger &&
    ExactDecimal.from(value.reserveTokens).compare(ExactDecimal.from(0)) >= 0
  )
}
function object(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}

function limitFacts(input: PlanInput) {
  if (!input || typeof input !== 'object') return undefined
  const copied = copyJsonValue(input.snapshot)
  if (!('ok' in copied) || !object(copied.ok)) return undefined
  const profile = copied.ok
  const image = Array.isArray(profile.inputModalities) && profile.inputModalities.includes('image')
  const constraints = profile.inputConstraints
  if (constraints !== undefined && !object(constraints)) return undefined
  const upstream = profile.upstreamInputLimits
  if (upstream !== undefined && !object(upstream)) return undefined
  return { profile, image, constraints, upstream }
}

function missingLimits({
  profile,
  image,
  constraints,
  upstream,
}: NonNullable<ReturnType<typeof limitFacts>>) {
  const metrics: InputLimitMetric[] = []
  const add = (metric: InputLimitMetric) => {
    if (!metrics.includes(metric)) metrics.push(metric)
  }
  if (!Object.hasOwn(profile, 'maxInputTokens')) add('maxInputTokens')
  if (image && (!object(constraints) || !Object.hasOwn(constraints, 'maxImageBytes')))
    add('maxImageBytes')
  for (const metric of [
    'maxInputTokens',
    ...(image ? (['maxImageBytes', 'maxImages'] as const) : []),
    'maxRequestBytes',
  ] as const)
    if (!object(upstream) || !Object.hasOwn(upstream, metric)) add(metric)
  return metrics
}

function fallbackImageConstraints(image: boolean, constraints: unknown) {
  return image && (!object(constraints) || !Object.hasOwn(constraints, 'maxImageBytes'))
    ? { ...(object(constraints) ? constraints : {}), maxImageBytes: 1 }
    : constraints
}

function fallbackLimits({
  profile,
  image,
  constraints,
  upstream,
}: NonNullable<ReturnType<typeof limitFacts>>) {
  return {
    ...profile,
    maxInputTokens: Object.hasOwn(profile, 'maxInputTokens') ? profile.maxInputTokens : 1,
    inputConstraints: fallbackImageConstraints(image, constraints),
    upstreamInputLimits: {
      ...(object(upstream) ? upstream : {}),
      ...Object.fromEntries(
        [
          'maxInputTokens',
          ...(image ? (['maxImageBytes', 'maxImages'] as const) : []),
          'maxRequestBytes',
        ]
          .filter(metric => !object(upstream) || !Object.hasOwn(upstream, metric))
          .map(metric => [metric, { status: 'unknown' }]),
      ),
    },
  }
}

function restoreMissingLimits(
  preflight: PlanInput,
  { profile, constraints, upstream }: NonNullable<ReturnType<typeof limitFacts>>,
) {
  const originalSnapshot = {
    ...preflight.snapshot,
    inputConstraints: { ...preflight.snapshot.inputConstraints },
    upstreamInputLimits: { ...preflight.snapshot.upstreamInputLimits },
  }
  for (const key of ['maxInputTokens', 'inputConstraints', 'upstreamInputLimits'])
    if (!Object.hasOwn(profile, key)) Reflect.deleteProperty(originalSnapshot, key)
  if (object(constraints))
    for (const key of Object.keys(originalSnapshot.inputConstraints))
      if (!Object.hasOwn(constraints, key))
        Reflect.deleteProperty(originalSnapshot.inputConstraints, key)
  if (object(upstream))
    for (const key of Object.keys(originalSnapshot.upstreamInputLimits))
      if (!Object.hasOwn(upstream, key))
        Reflect.deleteProperty(originalSnapshot.upstreamInputLimits, key)
  return originalSnapshot
}

/** Bounded validation-only copy for the three planning refusals that precede missing limits. */
export function preflightMissingInputLimits(input: PlanInput): {
  readonly input: PlanInput
  readonly original: PlanInput
  readonly metrics: readonly [InputLimitMetric, ...InputLimitMetric[]]
} | null {
  const facts = limitFacts(input)
  if (facts === undefined) return null
  const [first, ...rest] = missingLimits(facts)
  if (first === undefined) return null
  const candidate = fallbackLimits(facts)
  if (!snapshot(candidate)) return null
  const suppliedMargin = copyJsonValue(input.tokenMargin)
  const preflight = ownPlanInput({
    ...input,
    snapshot: candidate,
    tokenMargin:
      'ok' in suppliedMargin && margin(suppliedMargin.ok)
        ? suppliedMargin.ok
        : { multiplier: 1, reserveTokens: 0 },
  })
  if (preflight === undefined) return null
  // Preserve missing limits for adapter preflight without retaining caller-owned objects.
  const originalSnapshot = restoreMissingLimits(preflight, facts)
  const original = { ...preflight, snapshot: Object.freeze(originalSnapshot) }
  // Invalid margins remain invalid in adapter preflight; no fabricated admission is performed.
  Reflect.set(original, 'tokenMargin', 'ok' in suppliedMargin ? suppliedMargin.ok : undefined)
  return { input: preflight, original: Object.freeze(original), metrics: [first, ...rest] }
}
function planInputShape(input: PlanInput): boolean {
  return !(
    !input ||
    typeof input !== 'object' ||
    typeof input.routeName !== 'string' ||
    !input.routeName.length ||
    typeof input.provider !== 'string' ||
    !input.provider.length ||
    !Array.isArray(input.messages) ||
    !Array.isArray(input.tools) ||
    !input.target ||
    input.target.kind !== 'model_call'
  )
}

function ownProfileAndParameters(input: PlanInput) {
  const profile = copyJsonValue(input.snapshot)
  const requested = copyJsonValue(input.parameters)
  if (
    !('ok' in profile) ||
    !snapshot(profile.ok) ||
    !('ok' in requested) ||
    !parameters(requested.ok)
  )
    return undefined
  if (profile.ok.adaptation.definition.modelId !== input.routeName) return undefined
  if (
    requested.ok.maxOutputTokens !== undefined &&
    ExactDecimal.from(requested.ok.maxOutputTokens).compare(
      ExactDecimal.from(profile.ok.maxOutputTokens),
    ) > 0
  )
    return undefined
  return { profile: profile.ok, requested: requested.ok }
}

function ownTools(values: readonly ModelToolEntry[]): ModelToolEntry[] | undefined {
  const tools = []
  const names = new Set<string>()
  for (const raw of values) {
    const copied = copyJsonValue(raw)
    if (!('ok' in copied) || !tool(copied.ok) || names.has(copied.ok.name)) return undefined
    names.add(copied.ok.name)
    tools.push(copied.ok)
  }
  return tools
}

/** Standalone invocation boundary, before planning and pre-send cancellation. */
export function ownPlanInput(input: PlanInput): PlanInput | undefined {
  if (!planInputShape(input)) return undefined
  if ('rejected' in start(input.target)) return undefined
  const owned = ownProfileAndParameters(input)
  if (owned === undefined) return undefined
  const tokenMargin = copyJsonValue(input.tokenMargin)
  if (!('ok' in tokenMargin) || !margin(tokenMargin.ok)) return undefined
  const ownedCalibration = calibration(input.calibration)
  if (ownedCalibration === undefined) return undefined
  const messages = copyPlanMessages(input.messages)
  if (messages === undefined) return undefined
  const outputHistory = copyPlanOutputHistory(input.outputHistory, messages, ownedCalibration)
  if (outputHistory === undefined) return undefined
  const tools = ownTools(input.tools)
  if (tools === undefined) return undefined
  return Object.freeze({
    calibration: ownedCalibration,
    outputHistory,
    tokenMargin: Object.freeze(tokenMargin.ok),
    target: Object.freeze({
      kind: 'model_call',
      callId: input.target.callId,
      dispatch: input.target.dispatch,
    }),
    routeName: input.routeName,
    provider: input.provider,
    snapshot: owned.profile,
    parameters: owned.requested,
    messages: Object.freeze(messages),
    tools: Object.freeze(tools),
  })
}

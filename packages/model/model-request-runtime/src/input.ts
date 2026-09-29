import { copyJsonValue, isJsonNumber, judgeContentBlock } from '@omne-harness-lite/content-blocks'
import {
  validate as profileShape,
  judgeModelProfileDocument,
  type ModelProfileSnapshot,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import { judgeMessage } from '@omne-harness-lite/messages'
import { validate as toolShape, type ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { start } from '@omne-harness-lite/stream-assembly'
import { ExactDecimal, judgeAccountValue, type Usage } from '@omne-harness-lite/call-accounts'
import { copyInputCalibration } from '@omne-harness-lite/model-response'
import type { InputLimitMetric, PlanCalibration, PlanInput, TokenMargin } from './types.ts'

function index(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function calibration(value: unknown): PlanCalibration | undefined {
  const copied = copyJsonValue(value)
  if (!('ok' in copied) || !object(copied.ok)) return undefined
  const source = copied.ok
  if (source.kind === 'none') {
    return Object.keys(source).length === 2 &&
      (source.reason === 'no_observation' || source.reason === 'source_unavailable')
      ? { kind: 'none', reason: source.reason }
      : undefined
  }
  if (
    source.kind !== 'observation' ||
    Object.keys(source).length !== 5 ||
    !Array.isArray(source.outputBlocks) ||
    !Array.isArray(source.replaySelection)
  )
    return undefined
  const owned = copyInputCalibration(source.inputCalibration)
  if (!('ok' in owned) || !('ok' in judgeAccountValue('Usage', source.usage))) return undefined
  const blocks = []
  for (const item of source.outputBlocks) {
    const judged = judgeContentBlock(item)
    if (!('ok' in judged)) return undefined
    blocks.push(judged.ok)
  }
  const selection = []
  const targets = new Set<string>()
  for (const item of source.replaySelection) {
    if (
      !object(item) ||
      Object.keys(item).length !== 3 ||
      !index(item.sourceBlockIndex) ||
      item.sourceBlockIndex >= blocks.length ||
      !index(item.messageIndex) ||
      !index(item.blockIndex)
    )
      return undefined
    const key = `${item.messageIndex}:${item.blockIndex}`
    if (targets.has(key)) return undefined
    targets.add(key)
    selection.push({
      sourceBlockIndex: item.sourceBlockIndex,
      messageIndex: item.messageIndex,
      blockIndex: item.blockIndex,
    })
  }
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

/** Bounded validation-only copy for the three planning refusals that precede missing limits. */
export function preflightMissingInputLimits(input: PlanInput): {
  readonly input: PlanInput
  readonly metrics: readonly [InputLimitMetric, ...InputLimitMetric[]]
} | null {
  if (!input || typeof input !== 'object') return null
  const copied = copyJsonValue(input.snapshot)
  if (!('ok' in copied) || !object(copied.ok)) return null
  const profile = copied.ok
  const image = Array.isArray(profile.inputModalities) && profile.inputModalities.includes('image')
  const constraints = profile.inputConstraints
  if (constraints !== undefined && !object(constraints)) return null
  const upstream = profile.upstreamInputLimits
  if (upstream !== undefined && !object(upstream)) return null
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
  const [first, ...rest] = metrics
  if (first === undefined) return null
  const candidate = {
    ...profile,
    maxInputTokens: Object.hasOwn(profile, 'maxInputTokens') ? profile.maxInputTokens : 1,
    inputConstraints:
      image && (!object(constraints) || !Object.hasOwn(constraints, 'maxImageBytes'))
        ? { ...(object(constraints) ? constraints : {}), maxImageBytes: 1 }
        : constraints,
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
  return preflight === undefined ? null : { input: preflight, metrics: [first, ...rest] }
}
/** Standalone invocation boundary, before planning and pre-send cancellation. */
export function ownPlanInput(input: PlanInput): PlanInput | undefined {
  if (
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
    return undefined
  if ('rejected' in start(input.target)) return undefined
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
  const tokenMargin = copyJsonValue(input.tokenMargin)
  if (!('ok' in tokenMargin) || !margin(tokenMargin.ok)) return undefined
  const ownedCalibration = calibration(input.calibration)
  if (ownedCalibration === undefined) return undefined
  const messages = []
  for (const raw of input.messages) {
    const judged = judgeMessage(raw)
    if ('rejected' in judged) return undefined
    messages.push(judged.ok)
  }
  const tools = []
  const names = new Set<string>()
  for (const raw of input.tools) {
    const copied = copyJsonValue(raw)
    if (!('ok' in copied) || !tool(copied.ok) || names.has(copied.ok.name)) return undefined
    names.add(copied.ok.name)
    tools.push(copied.ok)
  }
  return Object.freeze({
    calibration: ownedCalibration,
    tokenMargin: Object.freeze(tokenMargin.ok),
    target: Object.freeze({
      kind: 'model_call',
      callId: input.target.callId,
      dispatch: input.target.dispatch,
    }),
    routeName: input.routeName,
    provider: input.provider,
    snapshot: profile.ok,
    parameters: requested.ok,
    messages: Object.freeze(messages),
    tools: Object.freeze(tools),
  })
}

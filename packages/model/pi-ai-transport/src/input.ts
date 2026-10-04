import { ownCalibration } from './calibration.ts'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import {
  validate as profileShape,
  judgeModelProfileDocument,
  type ModelProfileSnapshot,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import { judgeMessage } from '@omne-harness-lite/messages'
import { validate as toolShape, type ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { judgeArrivalEnvelope } from '@omne-harness-lite/arrival-events'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyPlanOutputHistory,
  type PlanInput,
} from '@omne-harness-lite/model-request-runtime-local'
import { object } from './json.ts'
import { tokenMarginValid } from './input-meter.ts'

function snapshot(value: unknown): value is ModelProfileSnapshot {
  return profileShape('ModelProfileSnapshot', value).valid
}
function parameters(value: unknown): value is ModelRequestParameters {
  return 'ok' in judgeModelProfileDocument('ModelRequestParameters', value)
}
function tool(value: unknown): value is ModelToolEntry {
  return toolShape('ModelToolEntry', value).valid
}
function planInputShape(input: PlanInput): boolean {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.routeName !== 'string' ||
    !input.routeName.length ||
    typeof input.provider !== 'string' ||
    !input.provider.length ||
    !Array.isArray(input.messages) ||
    !Array.isArray(input.tools) ||
    !tokenMarginValid(input.tokenMargin) ||
    !input.target ||
    input.target.kind !== 'model_call'
  )
    return false
  return true
}

/** Transport boundary, using public data judges; runtime is only a type dependency. */
export function ownPlanInput(input: PlanInput): PlanInput | undefined {
  if (!planInputShape(input)) return undefined
  if (
    'rejected' in
    judgeArrivalEnvelope({ target: input.target, event: { t: 'finish', reason: 'end' } })
  )
    return undefined
  const settings = ownPlanSettings(input)
  if (!settings) return undefined
  const { profile, requested, tokenMargin } = settings
  const calibration = ownCalibration(input.calibration)
  if (!calibration) return undefined
  const messages = ownMessages(input)
  if (!messages) return undefined
  const outputHistory = copyPlanOutputHistory(input.outputHistory, messages, calibration)
  if (outputHistory === undefined) return undefined
  if (
    calibration.kind === 'observation' &&
    calibration.replaySelection.some(
      selected => !messages[selected.messageIndex]?.blocks[selected.blockIndex],
    )
  )
    return undefined
  const tools = ownTools(input)
  if (!tools) return undefined
  return Object.freeze({
    calibration,
    outputHistory,
    tokenMargin: Object.freeze(tokenMargin),
    target: Object.freeze({
      kind: 'model_call',
      callId: input.target.callId,
      dispatch: input.target.dispatch,
    }),
    routeName: input.routeName,
    provider: input.provider,
    snapshot: profile,
    parameters: requested,
    messages: Object.freeze(messages),
    tools: Object.freeze(tools),
  })
}

/** Validation-only completion to check older refusal precedence before reporting missing caps. */
export function preflightInputWithMissingLimits(raw: PlanInput): PlanInput | undefined {
  const copied = copyJsonValue(raw?.snapshot)
  if (!('ok' in copied) || !object(copied.ok)) return undefined
  const original = copied.ok
  const image =
    Array.isArray(original.inputModalities) && original.inputModalities.includes('image')
  const upstream = object(original.upstreamInputLimits) ? original.upstreamInputLimits : {}
  const constraints = object(original.inputConstraints) ? original.inputConstraints : {}
  const candidate = {
    ...original,
    ...(Object.hasOwn(original, 'maxInputTokens') ? {} : { maxInputTokens: 1 }),
    upstreamInputLimits: upstreamLimits(),
    inputConstraints: {
      ...constraints,
      ...(image && !Object.hasOwn(constraints, 'maxImageBytes') ? { maxImageBytes: 1 } : {}),
    },
  }
  if (!snapshot(candidate)) return undefined
  // The temporary margin only lets earlier representation/refusal checks run.
  // A missing cap is reported before original margin validation by S-74.
  return ownPlanInput({
    ...raw,
    snapshot: candidate,
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
  })

  function upstreamLimits() {
    return {
      ...upstream,
      ...(Object.hasOwn(upstream, 'maxInputTokens')
        ? {}
        : { maxInputTokens: { status: 'unknown' } }),
      ...(Object.hasOwn(upstream, 'maxRequestBytes')
        ? {}
        : { maxRequestBytes: { status: 'unknown' } }),
      ...(image && !Object.hasOwn(upstream, 'maxImageBytes')
        ? { maxImageBytes: { status: 'unknown' } }
        : {}),
      ...(image && !Object.hasOwn(upstream, 'maxImages')
        ? { maxImages: { status: 'unknown' } }
        : {}),
    }
  }
}

function ownMessages(input: PlanInput): Array<PlanInput['messages'][number]> | undefined {
  const messages: Array<PlanInput['messages'][number]> = []
  for (const raw of input.messages) {
    const judged = judgeMessage(raw)
    if ('rejected' in judged) return undefined
    messages.push(judged.ok)
  }
  return messages
}

function ownTools(input: PlanInput): ModelToolEntry[] | undefined {
  const tools = []
  const names = new Set<string>()
  for (const raw of input.tools) {
    const copied = copyJsonValue(raw)
    if (!('ok' in copied) || !tool(copied.ok) || names.has(copied.ok.name)) return undefined
    names.add(copied.ok.name)
    tools.push(copied.ok)
  }
  return tools
}

function ownPlanSettings(input: PlanInput) {
  const profile = copyJsonValue(input.snapshot)
  const requested = copyJsonValue(input.parameters)
  const tokenMargin = copyJsonValue(input.tokenMargin)
  if (
    !('ok' in profile) ||
    !snapshot(profile.ok) ||
    !('ok' in requested) ||
    !('ok' in tokenMargin) ||
    !tokenMarginValid(tokenMargin.ok) ||
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
  return { profile: profile.ok, requested: requested.ok, tokenMargin: tokenMargin.ok }
}

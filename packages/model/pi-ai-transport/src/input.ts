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
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
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
/** Transport boundary, using public data judges; runtime is only a type dependency. */
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
    !tokenMarginValid(input.tokenMargin) ||
    !input.target ||
    input.target.kind !== 'model_call'
  )
    return undefined
  if (
    'rejected' in
    judgeArrivalEnvelope({ target: input.target, event: { t: 'finish', reason: 'end' } })
  )
    return undefined
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
    upstreamInputLimits: {
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
    },
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
}

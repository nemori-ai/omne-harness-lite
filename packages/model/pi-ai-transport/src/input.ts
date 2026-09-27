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

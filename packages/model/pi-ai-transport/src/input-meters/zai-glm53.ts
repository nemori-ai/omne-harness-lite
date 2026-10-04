import { defineInputMeter } from '../input-meter.ts'
// Text/tool projection from zai-org/GLM-5.3 aca966e4 and GLM-5.3-Flash
// eb9eb208 pinned chat_template.jinja. OpenRouter private conversion is unknown.
import {
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import type {ModelDefinition} from '@omne-harness-lite/model-request-runtime'
import type { InputMeter, TokenMeasurement } from '@omne-harness-lite/model-request-runtime'
import type { ZaiHistoryTreatment } from '../official-models/zai.ts'
import { guardInputMeter } from './shared.ts'
import { exactKeys, glm5Tokenizer, toolCalls, toolSchemas, visibleText } from './zai-glm52.ts'
import {
  projectZaiHistory,
  zaiAssistantReasoning,
  zaiCurrentRelease,
  zaiVisibleHistoryEvidence,
} from './zai-release.ts'

type TextMessage = Readonly<{ role: 'system' | 'user'; content: string }>
type AssistantMessage = Readonly<{
  role: 'assistant'
  content: string
  reasoning: string
  calls: string
  callIds: readonly string[]
}>
type ToolMessage = Readonly<{ role: 'tool'; content: string; callId: string }>
type Message = TextMessage | AssistantMessage | ToolMessage

function messages(body: JsonObject, history: ZaiHistoryTreatment): readonly Message[] | undefined {
  if (!Array.isArray(body.messages)) return undefined
  const parsed: Message[] = []
  for (const raw of body.messages) {
    if (!object(raw)) return undefined
    if (raw.role === 'system' || raw.role === 'user') {
      if (!exactKeys(raw, ['role', 'content'])) return undefined
      const content = visibleText(raw.content)
      if (content === undefined) return undefined
      parsed.push({ role: raw.role, content })
    } else if (raw.role === 'assistant') {
      const assistant = assistantMessage(raw, history)
      if (!assistant) return undefined
      parsed.push(assistant)
    } else if (raw.role === 'tool') {
      const tool = toolMessage(raw)
      if (!tool) return undefined
      parsed.push(tool)
    } else return undefined
  }
  return parsed
}

function toolMessage(raw: JsonObject): ToolMessage | undefined {
  if (!exactKeys(raw, ['role', 'tool_call_id', 'content']) || typeof raw.tool_call_id !== 'string')
    return undefined
  const content = visibleText(raw.content)
  if (content === undefined) return undefined
  return { role: 'tool', content, callId: raw.tool_call_id }
}

function assistantMessage(
  raw: JsonObject,
  history: ZaiHistoryTreatment,
): AssistantMessage | undefined {
  if (!exactKeys(raw, ['role', 'content', 'tool_calls', 'reasoning', 'reasoning_details']))
    return undefined
  // The published templates consume reasoning_content, while the final OpenRouter body
  // uses reasoning/reasoning_details. Only a visible-history release maps the plain
  // string into that slot; nothing is ever silently discarded.
  const thought = zaiAssistantReasoning(raw, history)
  if (thought === undefined) return undefined
  const content = visibleText(raw.content)
  const calls = toolCalls(raw.tool_calls)
  if (content === undefined || content.includes('</think>') || calls === undefined) return undefined
  const callIds = assistantCallIds(raw)
  if (!callIds) return undefined
  // An absent reasoning_content renders the same empty think pair as the empty string.
  return {
    role: 'assistant',
    content,
    reasoning: thought.reasoning ?? '',
    calls,
    callIds,
  }
}

function assistantCallIds(raw: JsonObject): string[] | undefined {
  const callIds: string[] = []
  if (raw.tool_calls !== undefined) {
    if (!Array.isArray(raw.tool_calls)) return undefined
    for (const call of raw.tool_calls) {
      if (!object(call) || typeof call.id !== 'string') return undefined
      callIds.push(call.id)
    }
  }
  return callIds
}

function renderToolBlock(group: readonly ToolMessage[], previous: Message | undefined): string {
  const callIds = previous?.role === 'assistant' ? previous.callIds : []
  const groupIds = group.map(message => message.callId)
  const sortable =
    callIds.length > 0 &&
    new Set(callIds).size === callIds.length &&
    new Set(groupIds).size === groupIds.length &&
    groupIds.every(id => id.length > 0 && callIds.includes(id))
  const ordered = sortable
    ? callIds.flatMap(id => group.filter(message => message.callId === id))
    : group
  return (
    '<|observation|>' +
    ordered.map(message => `<tool_response>${message.content}</tool_response>`).join('')
  )
}

/**
 * Published GLM-5.3 and Flash text/tool templates, narrowed to the final wire subset, with
 * `clear_thinking` at its template default (false): every historical assistant renders its
 * reasoning_content, so the treatment's history reaches the think slot as it stands.
 */
export function renderGlm53Prompt(
  wire: JsonObject,
  flash: boolean,
  history: ZaiHistoryTreatment,
): string | undefined {
  const body = projectZaiHistory(wire, history)
  if (!body) return undefined
  if (
    !exactKeys(body, [
      'model',
      'provider',
      'stream',
      'store',
      'messages',
      'tools',
      'max_tokens',
      'reasoning',
    ])
  )
    return undefined
  const parsed = messages(body, history)
  const schemas = toolSchemas(body.tools)
  if (!parsed || schemas === undefined) return undefined
  const namedEffort = reasoningEffort(body, flash)
  if (namedEffort === undefined) return undefined
  const prompt = `[gMASK]<sop><|system|>Reasoning Effort: ${namedEffort}` + schemas
  const rendered = renderMessages(parsed, prompt)
  return rendered === undefined ? undefined : rendered + '<|assistant|><think>'
}

function reasoningEffort(body: JsonObject, flash: boolean): string | undefined {
  if (flash && body.reasoning !== undefined) return undefined
  const effort = body.reasoning
  if (
    effort !== undefined &&
    (!object(effort) ||
      !exactKeys(effort, ['effort']) ||
      (effort.effort !== 'low' && effort.effort !== 'high' && effort.effort !== 'max'))
  )
    return undefined
  return effortName(effort)
}

function effortName(effort: JsonValue | undefined): string {
  const effectiveEffort = effort && object(effort) ? effort.effort : 'max'
  return effectiveEffort === 'low' ? 'Low' : effectiveEffort === 'high' ? 'High' : 'Max'
}

function renderMessages(parsed: readonly Message[], prompt: string): string | undefined {
  for (let index = 0; index < parsed.length; index++) {
    const message = parsed[index]
    if (!message) return undefined
    if (message.role === 'system') prompt += `<|system|>${message.content}`
    else if (message.role === 'user') prompt += `<|user|>${message.content}`
    else if (message.role === 'assistant')
      prompt += `<|assistant|><think>${message.reasoning}</think>${message.content.trim()}${message.calls}${message.calls ? '\n' : ''}`
    else {
      if (index > 0 && parsed[index - 1]?.role === 'tool') continue
      const group = consecutiveTools(parsed, index)
      prompt += renderToolBlock(group, parsed[index - 1])
    }
  }
  return prompt
}

function consecutiveTools(parsed: readonly Message[], index: number): ToolMessage[] {
  const group: ToolMessage[] = []
  for (let next = index; next < parsed.length && parsed[next]?.role === 'tool'; next++) {
    const item = parsed[next]
    if (item?.role === 'tool') group.push(item)
  }
  return group
}

// Release-gating ZV0 observation of each leaf's current-binding reply shape (one paid
// single-round stream each, Z.AI route); receipts stay in the private certification archive.
const glm53Zv0Evidence =
  'ZV0 2026-09-30 effort max: one Z.AI stream, 139/139 detail frames exactly the four-key reasoning.text shape with identical parallel reasoning, one reasoning segment; receipt sha256 7fa6ac6610cf66589d9eea7a51997f6bd9e4f06b991e41cfd687dc963f647fae'
const flashZv0Evidence =
  'ZV0 2026-09-30 default effort: one Z.AI stream, 78/78 detail frames exactly the four-key reasoning.text shape with identical parallel reasoning, one reasoning segment; receipt sha256 b86083068e9fabdb4fa3bb03114b30c105160f782120cf54fb865c60f8f307be'

/**
 * Distinct exact model bindings use the same pinned tokenizer and their own templates. Only
 * the current exported release of each leaf is accepted; its implementation revision fixes
 * the reasoning-history treatment. The full/φ/δ methods run the shared source guards.
 */
export function createGlm53InputMeter(definition: ModelDefinition): InputMeter {
  const flash = definition.modelId === 'z-ai/glm-5.3-flash'
  const current =
    definition.modelId === 'z-ai/glm-5.3' || flash
      ? zaiCurrentRelease(definition, 'z-ai/fp8')
      : undefined
  if (!current) throw new TypeError('unsupported GLM-5.3 input-meter binding')
  const { release, history } = current
  const encoder = glm5Tokenizer()
  const evidence = flash
    ? 'zai-org/GLM-5.3-Flash eb9eb208eb0d988989d07a6a12d0fdeb5f52574a template (MIT) + tokenizer.json 19e77364; text/tools only, OpenRouter private projection estimated'
    : 'zai-org/GLM-5.3 aca966e4e02791568aa6a4ced368624b3d897f42 template (GLM-5.3 License) + tokenizer.json 19e77364; OpenRouter private projection estimated'
  const raw = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'z-ai/fp8',
    algorithmRevision: release.algorithmRevision,
    ...(release.tokenizerRevision === undefined
      ? {}
      : { tokenizerRevision: release.tokenizerRevision }),
    evidence:
      history === 'visible'
        ? `${evidence}; ${zaiVisibleHistoryEvidence}; ${flash ? flashZv0Evidence : glm53Zv0Evidence}`
        : evidence,
    measureFull({ body, serialized }): TokenMeasurement {
      if (body.model !== definition.modelId || writeJsonLossless(body) !== serialized)
        return { kind: 'unavailable' }
      const prompt = renderGlm53Prompt(body, flash, history)
      if (prompt === undefined) return { kind: 'unavailable' }
      try {
        return {
          kind: 'estimated',
          tokens: encoder.encode(prompt, { add_special_tokens: false }).ids.length,
        }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  })
  return guardInputMeter(raw)
}

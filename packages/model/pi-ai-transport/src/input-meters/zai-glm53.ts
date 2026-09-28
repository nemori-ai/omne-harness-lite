// Text/tool projection from zai-org/GLM-5.3 aca966e4 and GLM-5.3-Flash
// eb9eb208 pinned chat_template.jinja. OpenRouter private conversion is unknown.
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import type { ModelDefinition } from '../definitions.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'
import { exactKeys, glm5Tokenizer, toolCalls, toolSchemas, visibleText } from './zai-glm52.ts'

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

function messages(body: JsonObject, plainHistory: boolean): readonly Message[] | undefined {
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
      if (!exactKeys(raw, ['role', 'content', 'tool_calls', 'reasoning', 'reasoning_details']))
        return undefined
      // The published templates consume reasoning_content, while the final
      // OpenRouter body uses reasoning/reasoning_details. No observed mapping
      // proves they are equivalent; do not silently discard either.
      if (
        raw.reasoning_details !== undefined ||
        (raw.reasoning !== undefined && (!plainHistory || typeof raw.reasoning !== 'string'))
      )
        return undefined
      const content = visibleText(raw.content)
      const calls = toolCalls(raw.tool_calls)
      if (content === undefined || content.includes('</think>') || calls === undefined)
        return undefined
      const callIds: string[] = []
      if (raw.tool_calls !== undefined) {
        if (!Array.isArray(raw.tool_calls)) return undefined
        for (const call of raw.tool_calls) {
          if (!object(call) || typeof call.id !== 'string') return undefined
          callIds.push(call.id)
        }
      }
      parsed.push({
        role: 'assistant',
        content,
        reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : '',
        calls,
        callIds,
      })
    } else if (raw.role === 'tool') {
      if (
        !exactKeys(raw, ['role', 'tool_call_id', 'content']) ||
        typeof raw.tool_call_id !== 'string'
      )
        return undefined
      const content = visibleText(raw.content)
      if (content === undefined) return undefined
      parsed.push({ role: 'tool', content, callId: raw.tool_call_id })
    } else return undefined
  }
  return parsed
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

/** Published GLM-5.3 and Flash text/tool templates, narrowed to the final wire subset. */
export function renderGlm53Prompt(body: JsonObject, flash: boolean): string | undefined {
  return renderPrompt(body, flash, false)
}

/** Offline candidate: map plaintext reasoning to the template's reasoning_content.
 * This is not a verified OpenRouter conversion and is not used by production meters.
 */
export function renderGlm53HistoryCandidatePrompt(body: JsonObject): string | undefined {
  return renderPrompt(body, false, true)
}

function renderPrompt(body: JsonObject, flash: boolean, plainHistory: boolean): string | undefined {
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
  const parsed = messages(body, plainHistory)
  const schemas = toolSchemas(body.tools)
  if (!parsed || schemas === undefined) return undefined
  if (flash && body.reasoning !== undefined) return undefined
  const effort = body.reasoning
  if (
    effort !== undefined &&
    (!object(effort) ||
      !exactKeys(effort, ['effort']) ||
      (effort.effort !== 'low' && effort.effort !== 'high' && effort.effort !== 'max'))
  )
    return undefined
  const effectiveEffort = effort && object(effort) ? effort.effort : 'max'
  const namedEffort =
    effectiveEffort === 'low' ? 'Low' : effectiveEffort === 'high' ? 'High' : 'Max'
  let prompt = `[gMASK]<sop><|system|>Reasoning Effort: ${namedEffort}` + schemas
  for (let index = 0; index < parsed.length; index++) {
    const message = parsed[index]
    if (!message) return undefined
    if (message.role === 'system') prompt += `<|system|>${message.content}`
    else if (message.role === 'user') prompt += `<|user|>${message.content}`
    else if (message.role === 'assistant')
      prompt += `<|assistant|><think>${message.reasoning}</think>${message.content.trim()}${message.calls}${message.calls ? '\n' : ''}`
    else {
      if (index > 0 && parsed[index - 1]?.role === 'tool') continue
      const group: ToolMessage[] = []
      for (let next = index; next < parsed.length && parsed[next]?.role === 'tool'; next++) {
        const item = parsed[next]
        if (item?.role === 'tool') group.push(item)
      }
      prompt += renderToolBlock(group, parsed[index - 1])
    }
  }
  return prompt + '<|assistant|><think>'
}

/** Distinct exact model bindings use the same pinned tokenizer and their own templates. */
export function createGlm53InputMeter(definition: ModelDefinition): InputMeter {
  const flash = definition.modelId === 'z-ai/glm-5.3-flash'
  if (
    (definition.modelId !== 'z-ai/glm-5.3' && !flash) ||
    definition.revision !== '1' ||
    definition.implementation.name !== 'pi-ai:zai' ||
    definition.implementation.revision !== 'mp4-1' ||
    !Object.hasOwn(definition.routes, 'z-ai/fp8')
  )
    throw new TypeError('unsupported GLM-5.3 input-meter binding')
  const encoder = glm5Tokenizer()
  const meter: InputMeter = {
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'z-ai/fp8',
    algorithmRevision: flash ? 'glm-5.3-flash-public-template-1' : 'glm-5.3-public-template-1',
    evidence: flash
      ? 'zai-org/GLM-5.3-Flash eb9eb208eb0d988989d07a6a12d0fdeb5f52574a template (MIT) + tokenizer.json 19e77364; text/tools only, OpenRouter private projection estimated'
      : 'zai-org/GLM-5.3 aca966e4e02791568aa6a4ced368624b3d897f42 template (GLM-5.3 License) + tokenizer.json 19e77364; OpenRouter private projection estimated',
    measure({ body, serialized }): TokenMeasurement {
      if (body.model !== definition.modelId || writeJsonLossless(body) !== serialized)
        return { kind: 'unavailable' }
      const prompt = renderGlm53Prompt(body, flash)
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
  }
  return Object.freeze(meter)
}

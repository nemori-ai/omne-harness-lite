// Derived from pi 0.86.1 openai-completions.ts, commit 3390bd93630965a12a0a1a5c36ce890ec22f7e1d.
// Copyright (c) 2025 Mario Zechner. MIT: ../LICENSE.pi. See provenance.json for changes.
import { createHash } from 'node:crypto'
import {
  writeJsonLossless,
  readOpaqueJson,
  isJsonNumber,
  type JsonObject,
  type JsonValue,
  type ContentBlock,
} from '@omne-harness-lite/content-blocks'
import type {
  PlanInput,
  PlanResult,
  PlannedSemantics,
} from '@omne-harness-lite/model-request-runtime'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import { pilotDefinitions, type ModelDefinition, type CachePolicy } from './definitions.ts'
import { object, ownedObject } from './json.ts'
import { ownPlanInput } from './input.ts'

export interface PlannedRequest extends PlannedSemantics {
  readonly body: JsonObject
  readonly serialized: string
}
const plans = new WeakSet<PlannedRequest>()
type MutableObject = { [key: string]: JsonValue }
export function isPlannedRequest(value: PlannedRequest): boolean {
  return plans.has(value)
}
export const PI_AI_CARRIABLE_MODALITIES = Object.freeze(['text', 'image'] as const)
const protectedKeys = new Set([
  'model',
  'messages',
  'stream',
  'stream_options',
  'provider',
  'models',
  'route',
  'tools',
  'tool_choice',
  'user',
  'session_id',
  'prompt_cache_key',
  'store',
  'transforms',
  'plugins',
  'cache_control',
  'temperature',
  'top_p',
  'seed',
  'stop',
  'frequency_penalty',
  'presence_penalty',
  'max_tokens',
  'max_completion_tokens',
  'reasoning',
  'reasoning_effort',
])

export function cachePolicy(
  values: JsonObject,
  expected: CachePolicy['mode'],
): CachePolicy | undefined {
  if (Object.keys(values).some(key => key !== 'cache')) return undefined
  const cache = values.cache
  if (!object(cache) || cache.mode !== expected) return undefined
  if (expected === 'automatic')
    return Object.keys(cache).length === 1 ? { mode: 'automatic' } : undefined
  if (
    Object.keys(cache).some(key => !['mode', 'ttl', 'breakpoints'].includes(key)) ||
    typeof cache.ttl !== 'string' ||
    !['5m', '1h'].includes(cache.ttl) ||
    !Array.isArray(cache.breakpoints) ||
    !cache.breakpoints.length
  )
    return undefined
  const breakpoints: ('system' | 'last_tool' | 'last_message')[] = []
  for (const key of cache.breakpoints) {
    if (key !== 'system' && key !== 'last_tool' && key !== 'last_message') return undefined
    if (breakpoints.includes(key)) return undefined
    breakpoints.push(key)
  }
  return { mode: 'explicit', ttl: cache.ttl, breakpoints }
}
function normalizeToolCallId(id: string): string {
  // Deterministic request-local rewrite; invocation and result share the same transform.
  return /^[A-Za-z0-9_-]{1,64}$/.test(id)
    ? id
    : `call_${createHash('sha256').update(id).digest('base64url').slice(0, 32)}`
}
function parts(blocks: readonly ContentBlock[], images: boolean): JsonObject[] | undefined {
  const result: JsonObject[] = []
  for (const block of blocks) {
    if (!block.visibility.toModel) continue
    if (block.kind === 'text') result.push({ type: 'text', text: block.text })
    else if ('transcript' in block && typeof block.transcript === 'string')
      result.push({ type: 'text', text: block.transcript })
    else if (block.kind === 'image' && images && 'inline' in block.data)
      result.push({
        type: 'image_url',
        image_url: { url: `data:${block.mediaType};base64,${block.data.inline}` },
      })
    else if (block.kind === 'tool_result') {
      const nested = parts(block.blocks, images)
      if (!nested) return undefined
      result.push(...nested)
    } else if (
      block.kind === 'thinking' ||
      (block.kind === 'tool_call' && !block.visibility.toModel)
    )
      continue
    else return undefined
  }
  return result
}
function addBreakpoint(message: MutableObject, control: JsonObject): void {
  const content = message.content
  if (typeof content === 'string' && content.length)
    message.content = [{ type: 'text', text: content, cache_control: control }]
  else if (Array.isArray(content)) {
    for (let n = content.length - 1; n >= 0; n--) {
      const part = content[n]
      if (object(part) && part.type === 'text') {
        message.content = content.map((value, index) =>
          index === n ? { ...part, cache_control: control } : value,
        )
        return
      }
    }
  }
}
export function planRequest(
  raw: PlanInput,
  definitions: readonly ModelDefinition[] = pilotDefinitions,
): PlanResult<PlannedRequest> {
  const input = ownPlanInput(raw)
  if (!input) return { rejected: 'invalidInput' }
  const binding = input.snapshot.adaptation
  const definition = definitions.find(
    d =>
      d.modelId === input.routeName &&
      d.revision === binding.definition.revision &&
      d.implementation.name === binding.implementation.name &&
      d.implementation.revision === binding.implementation.revision,
  )
  if (!definition) return { rejected: 'unavailable' }
  const mode = Object.hasOwn(definition.routes, input.provider)
    ? definition.routes[input.provider]
    : undefined
  if (!mode) return { rejected: 'unavailable' }
  const cache = cachePolicy(binding.configuration.values, mode)
  if (!cache) return { rejected: 'invalidInput' }
  const images = input.snapshot.inputModalities.includes('image')
  const messages: MutableObject[] = []
  const calls = new Set<string>(),
    results = new Set<string>()
  for (const message of input.messages) {
    if (message.type === 'tool_internal') return { rejected: 'tool_internal_in_request' }
    if (message.type === 'assistant') {
      const content: string[] = [],
        thinking: string[] = [],
        tools: JsonObject[] = [],
        details: JsonValue[] = []
      for (const block of message.blocks) {
        if (!block.visibility.toModel) continue
        if (block.kind === 'text') content.push(block.text)
        else if (block.kind === 'thinking') {
          thinking.push(block.text)
          if (block.opaque) {
            const opaque = readOpaqueJson(block.opaque)
            if (
              object(opaque) &&
              opaque.routeName === input.routeName &&
              Array.isArray(opaque.reasoning_details)
            )
              details.push(...opaque.reasoning_details)
          }
        } else if (block.kind === 'tool_call' && block.complete) {
          calls.add(block.callId)
          tools.push({
            id: normalizeToolCallId(block.callId),
            type: 'function',
            function: {
              name: block.tool,
              arguments: block.unparseable
                ? block.rawArguments
                : writeJsonLossless(block.arguments),
            },
          })
        } else return { rejected: 'modality_not_carried' }
      }
      messages.push({
        role: 'assistant',
        content: content.join(''),
        ...(tools.length ? { tool_calls: tools } : {}),
        ...(details.length
          ? { reasoning_details: details }
          : thinking.some(Boolean)
            ? { reasoning: thinking.join('') }
            : {}),
      })
      continue
    }
    const converted = parts(message.blocks, images)
    if (!converted) return { rejected: 'modality_not_carried' }
    if (message.type === 'tool') {
      results.add(message.callId)
      const text = converted
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('')
      messages.push({
        role: 'tool',
        tool_call_id: normalizeToolCallId(message.callId),
        content: text || '(no tool output)',
      })
      const imageParts = converted.filter(p => p.type === 'image_url')
      if (imageParts.length) messages.push({ role: 'user', content: imageParts })
    } else {
      const role =
        message.type === 'system_reminder'
          ? definition.reminderRole
          : message.type === 'compaction'
            ? 'user'
            : message.type
      const marked = message.type === 'system_reminder' || message.type === 'compaction'
      const content = marked
        ? [
            { type: 'text', text: `[${message.type} ${writeJsonLossless(message.id)}]` },
            ...converted,
          ]
        : converted
      messages.push({ role, content })
    }
  }
  if ([...calls].some(id => !results.has(id))) return { rejected: 'orphan_tool_call' }
  const tools = input.tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
  const body: MutableObject = {
    model: input.routeName,
    provider: { order: [input.provider], allow_fallbacks: false, require_parameters: true },
    stream: true,
    store: false,
    messages,
    ...(tools.length ? { tools } : {}),
  }
  const parameters: { -readonly [K in keyof ModelRequestParameters]: ModelRequestParameters[K] } = {
    ...input.parameters,
  }
  const dropped: string[] = []
  const mapping = [
    ['temperature', 'temperature'],
    ['topP', 'top_p'],
    ['seed', 'seed'],
    ['maxOutputTokens', 'max_tokens'],
    ['stopSequences', 'stop'],
    ['frequencyPenalty', 'frequency_penalty'],
    ['presencePenalty', 'presence_penalty'],
  ] as const
  for (const [name, wire] of mapping) {
    const value = input.parameters[name]
    if (value !== undefined) body[wire] = value
  }
  if (input.parameters.reasoningEffort === 'max') {
    dropped.push('reasoningEffort')
    delete parameters.reasoningEffort
  } else if (input.parameters.reasoningEffort !== undefined)
    body.reasoning = { effort: input.parameters.reasoningEffort }
  if (input.parameters.extra !== undefined) {
    const extra: MutableObject = {}
    for (const [key, value] of Object.entries(input.parameters.extra)) {
      if (protectedKeys.has(key)) dropped.push(`extra.${key}`)
      else {
        body[key] = value
        extra[key] = value
      }
    }
    parameters.extra = Object.freeze(extra)
  }
  if (cache.mode === 'explicit') {
    const control: JsonObject = { type: 'ephemeral', ttl: cache.ttl }
    for (const breakpoint of cache.breakpoints) {
      if (breakpoint === 'system') {
        const instruction = messages.find(m => m.role === 'system' || m.role === 'developer')
        if (instruction) addBreakpoint(instruction, control)
      }
      if (breakpoint === 'last_tool') {
        const last = tools.at(-1)
        if (last) Object.assign(last, { cache_control: control })
      }
      if (breakpoint === 'last_message') {
        const last = messages.findLast(
          m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool',
        )
        if (last) addBreakpoint(last, control)
      }
    }
  }
  const owned = ownedObject(body)
  if (!owned) throw new Error('planned wire body is not JSON')
  const planned = Object.freeze({
    input,
    parameters: Object.freeze(parameters),
    body: owned,
    serialized: writeJsonLossless(owned),
    ...(dropped.length ? { droppedParameters: Object.freeze(dropped) } : {}),
  })
  plans.add(planned)
  return { planned }
}

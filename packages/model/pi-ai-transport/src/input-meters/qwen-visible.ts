import {
  isNonNegativeJsonInteger,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { ModelDefinition } from '../definitions.ts'
import { object } from '../json.ts'

function keys(value: JsonObject, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function visibleContent(value: JsonValue | undefined, cache: boolean): boolean {
  if (typeof value === 'string' || value === null) return true
  return (
    Array.isArray(value) &&
    value.every(part => {
      if (
        !object(part) ||
        part.type !== 'text' ||
        typeof part.text !== 'string' ||
        !keys(part, ['type', 'text', 'cache_control'])
      )
        return false
      if (part.cache_control === undefined) return true
      return (
        cache &&
        object(part.cache_control) &&
        keys(part.cache_control, ['type', 'ttl']) &&
        part.cache_control.type === 'ephemeral' &&
        part.cache_control.ttl === '5m'
      )
    })
  )
}

function visibleDetails(value: JsonValue): boolean {
  return (
    Array.isArray(value) &&
    value.every(detail => {
      if (!object(detail)) return false
      const key =
        detail.type === 'reasoning.text'
          ? 'text'
          : detail.type === 'reasoning.summary'
            ? 'summary'
            : undefined
      return (
        key !== undefined &&
        typeof detail[key] === 'string' &&
        keys(detail, ['type', key, 'id', 'format', 'index']) &&
        (detail.id === undefined || detail.id === null || typeof detail.id === 'string') &&
        (detail.format === undefined || typeof detail.format === 'string') &&
        (detail.index === undefined || isNonNegativeJsonInteger(detail.index))
      )
    })
  )
}

/** Full visible final-wire JSON surrogate. No private ChatML equivalence claim. */
export function renderQwenVisibleInput(
  body: JsonObject,
  definition: ModelDefinition,
): string | undefined {
  const route = definition.routes.alibaba
  if (
    !route ||
    !keys(body, [
      'model',
      'provider',
      'stream',
      'store',
      'messages',
      'tools',
      'max_tokens',
      'reasoning',
    ]) ||
    !object(body.provider) ||
    !keys(body.provider, ['order', 'allow_fallbacks', 'require_parameters']) ||
    body.provider.require_parameters !== true ||
    (body.stream !== undefined && typeof body.stream !== 'boolean') ||
    (body.store !== undefined && typeof body.store !== 'boolean') ||
    (body.max_tokens !== undefined && !isNonNegativeJsonInteger(body.max_tokens)) ||
    !Array.isArray(body.messages)
  )
    return undefined
  const reasoning = body.reasoning
  if (reasoning !== undefined) {
    const rule = route.parameters.reasoningEffort
    if (
      !object(reasoning) ||
      !keys(reasoning, ['effort']) ||
      typeof reasoning.effort !== 'string' ||
      rule.kind !== 'select' ||
      !('values' in rule.accepted) ||
      !rule.accepted.values.some(value => value === reasoning.effort)
    )
      return undefined
  }
  if (
    body.tools !== undefined &&
    (!Array.isArray(body.tools) ||
      body.tools.some(
        tool =>
          !object(tool) ||
          !keys(tool, ['type', 'function']) ||
          tool.type !== 'function' ||
          !object(tool.function) ||
          !keys(tool.function, ['name', 'description', 'parameters']) ||
          typeof tool.function.name !== 'string' ||
          (tool.function.description !== undefined &&
            typeof tool.function.description !== 'string') ||
          !object(tool.function.parameters),
      ))
  )
    return undefined
  for (const message of body.messages) {
    if (
      !object(message) ||
      !['system', 'user', 'assistant', 'tool'].includes(String(message.role)) ||
      !keys(message, [
        'role',
        'content',
        'reasoning',
        'reasoning_details',
        'tool_calls',
        'tool_call_id',
      ]) ||
      !visibleContent(message.content, route.cache.mode === 'explicit' && message.role === 'system')
    )
      return undefined
    if (
      message.role !== 'assistant' &&
      (message.reasoning !== undefined ||
        message.reasoning_details !== undefined ||
        message.tool_calls !== undefined)
    )
      return undefined
    if (message.reasoning !== undefined && typeof message.reasoning !== 'string') return undefined
    if (message.reasoning_details !== undefined && !visibleDetails(message.reasoning_details))
      return undefined
    if (
      message.role === 'tool'
        ? typeof message.tool_call_id !== 'string'
        : message.tool_call_id !== undefined
    )
      return undefined
    if (
      message.tool_calls !== undefined &&
      (!Array.isArray(message.tool_calls) ||
        message.tool_calls.some(
          call =>
            !object(call) ||
            !keys(call, ['id', 'type', 'function']) ||
            typeof call.id !== 'string' ||
            call.type !== 'function' ||
            !object(call.function) ||
            !keys(call.function, ['name', 'arguments']) ||
            typeof call.function.name !== 'string' ||
            typeof call.function.arguments !== 'string',
        ))
    )
      return undefined
  }
  // Preserve strings, arrays, whitespace, schema numbers, protocol/cache fields,
  // tool order and visible reasoning exactly. Ciphertext/media never enter BPE.
  return writeJsonLossless(body)
}

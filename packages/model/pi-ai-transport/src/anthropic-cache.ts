import { type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import type { CountingBasis } from '@omne-harness-lite/model-response'
import { object } from './json.ts'

export type CacheTarget =
  | { readonly kind: 'text'; readonly messageIndex: number; readonly partIndex: number | undefined }
  | { readonly kind: 'pureImage'; readonly messageIndex: number }
/** One strict target selector for planning and neutral projection. Never backtracks. */
export function selectAnthropicCacheTarget(
  messages: readonly JsonValue[],
): CacheTarget | undefined {
  let messageIndex = messages.length - 1
  while (messageIndex >= 0) {
    const message = messages[messageIndex]
    if (object(message) && ['user', 'assistant', 'tool'].includes(String(message.role))) break
    messageIndex--
  }
  const message = messages[messageIndex]
  if (!object(message)) return undefined
  if (typeof message.content === 'string')
    return message.content.length ? { kind: 'text', messageIndex, partIndex: undefined } : undefined
  if (!messageHasParts(message)) return undefined
  const text = selectTextPart(message, messageIndex)
  if (text) return text
  return selectPureImage(messages, message, messageIndex)
}
function messageHasParts(message: JsonObject): message is JsonObject & { content: JsonValue[] } {
  return !(!Array.isArray(message.content) || !message.content.length)
}
function selectTextPart(
  message: JsonObject & { content: JsonValue[] },
  messageIndex: number,
): CacheTarget | undefined {
  for (let i = message.content.length - 1; i >= 0; i--) {
    const part = message.content[i]
    if (object(part) && part.type === 'text' && typeof part.text === 'string' && part.text.length)
      return { kind: 'text', messageIndex, partIndex: i }
  }
  return undefined
}
function selectPureImage(
  messages: readonly JsonValue[],
  message: JsonObject & { content: JsonValue[] },
  messageIndex: number,
): CacheTarget | undefined {
  if (
    message.role === 'user' &&
    messageIndex === messages.length - 1 &&
    message.content.every(
      part =>
        object(part) &&
        part.type === 'image_url' &&
        object(part.image_url) &&
        typeof part.image_url.url === 'string' &&
        /^data:image\/[^;]+;base64,[A-Za-z0-9+/]+=*$/.test(part.image_url.url),
    )
  )
    return { kind: 'pureImage', messageIndex }
  return undefined
}
export function attachAnthropicCache(body: JsonObject, ttl: string): JsonObject | undefined {
  if (!Array.isArray(body.messages)) return undefined
  const messages = body.messages
  const target = selectAnthropicCacheTarget(messages)
  if (!target) return undefined
  const control: JsonObject = { type: 'ephemeral', ttl }
  if (target.kind === 'pureImage') return { ...body, cache_control: control }
  const message = messages[target.messageIndex]
  if (!object(message)) return undefined
  const originalContent = message.content
  const content =
    target.partIndex === undefined
      ? [{ type: 'text', text: originalContent ?? '', cache_control: control }]
      : Array.isArray(originalContent)
        ? originalContent.map((part, index) =>
            index === target.partIndex && object(part) ? { ...part, cache_control: control } : part,
          )
        : undefined
  if (!content) return undefined
  return {
    ...body,
    messages: messages.map((value, index) =>
      index === target.messageIndex ? { ...message, content } : value,
    ),
  }
}
const models = new Set([
  'anthropic/claude-opus-5.5',
  'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-fable-5.1',
])
/** Own body before calling; removes only the exact configured, selected marker. */
export function cacheNeutralBody(body: JsonObject, basis: CountingBasis): JsonObject {
  const config = basis.binding.configuration.values.cache
  if (!neutralCacheConfiguration(basis, config) || !bodyHasMessages(body)) return body
  const target = selectAnthropicCacheTarget(body.messages)
  if (!target) return body
  const exact = (value: JsonValue | undefined): boolean =>
    object(value) &&
    Object.keys(value).length === 2 &&
    value.type === 'ephemeral' &&
    value.ttl === config.ttl
  if (target.kind === 'pureImage') {
    if (exact(body.cache_control)) {
      const { cache_control: _control, ...neutral } = body
      return neutral
    }
    return body
  }
  return neutralTextPart(body, target, exact)
}
function bodyHasMessages(body: JsonObject): body is JsonObject & { messages: JsonValue[] } {
  return Array.isArray(body.messages)
}
function neutralCacheConfiguration(
  basis: CountingBasis,
  config: JsonValue | undefined,
): config is JsonObject {
  return !(
    basis.provider !== 'anthropic' ||
    !models.has(basis.model) ||
    basis.binding.implementation.name !== 'pi-ai:anthropic' ||
    basis.binding.implementation.revision !== 'mp4-18' ||
    !object(config) ||
    config.mode !== 'explicit' ||
    typeof config.ttl !== 'string' ||
    !Array.isArray(config.breakpoints) ||
    config.breakpoints.length !== 1 ||
    config.breakpoints[0] !== 'last_message'
  )
}
function neutralTextPart(
  body: JsonObject & { messages: JsonValue[] },
  target: Extract<CacheTarget, { kind: 'text' }>,
  exact: (value: JsonValue | undefined) => boolean,
): JsonObject {
  const message = body.messages[target.messageIndex]
  if (!object(message) || !Array.isArray(message.content) || target.partIndex === undefined)
    return body
  const part = message.content[target.partIndex]
  if (!object(part) || !exact(part.cache_control)) return body
  const { cache_control: _control, ...neutral } = part
  const content = message.content
  return {
    ...body,
    messages: body.messages.map((value, index) =>
      index === target.messageIndex
        ? {
            ...message,
            content: content.map((value, index) => (index === target.partIndex ? neutral : value)),
          }
        : value,
    ),
  }
}

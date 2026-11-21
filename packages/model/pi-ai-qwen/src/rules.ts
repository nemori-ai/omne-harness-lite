import {
  readJsonText,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import type { ModelFault, TransportFailure } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import type {
  ChatUsage,
  ChatUsageItem,
  GatewayUsage,
  ReasoningCodec,
  ReasoningDetail,
  ReplayPart,
  ReplayWire,
  VendorHooks,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { QWEN_OWNER } from './owner.ts'
import type { QwenRecord } from './record.ts'

const TEXT_DETAIL = 'reasoning.text'
/** The text a gateway writes in place of reasoning it withholds. It is never a replayable item. */
const REDACTED = '[REDACTED]'

type RuleOf<H> = (record: QwenRecord) => H

function stringMember(raw: Readonly<Record<string, JsonValue>>, key: string): string | null {
  const value = raw[key]
  return value?.kind === 'string' ? value.value : null
}

function isReplayable(raw: Readonly<Record<string, JsonValue>>): boolean {
  const text = stringMember(raw, 'text')
  return (
    stringMember(raw, 'type') === TEXT_DETAIL &&
    text !== null &&
    text.length > 0 &&
    text !== REDACTED
  )
}

function byKey(left: string, right: string): number {
  if (left < right) return -1
  return left > right ? 1 : 0
}

function payloadOf(detail: ReasoningDetail): string {
  const keys = Object.keys(detail.raw).toSorted(byKey)
  return writeJsonText({
    kind: 'object',
    entries: keys.flatMap(key => {
      const value = detail.raw[key]
      return value === undefined ? [] : [{ key, value }]
    }),
  })
}

function payloadLimits(payload: string): JsonLimits {
  const bound = Math.max(1, payload.length * 4)
  return {
    maxBytes: bound,
    maxDepth: bound,
    maxItems: bound,
    maxMembers: bound,
    maxStringLength: bound,
    maxNumberLength: bound,
  }
}

function itemOf(part: ReplayPart): Readonly<Record<string, JsonValue>> | null {
  const read = readJsonText(part.payload, payloadLimits(part.payload))
  if (read.kind !== 'ok' || read.value.kind !== 'object') return null
  const raw = Object.fromEntries(read.value.entries.map(entry => [entry.key, entry.value]))
  return isReplayable(raw) ? raw : null
}

function seal(
  details: readonly ReasoningDetail[],
): Outcome<readonly Readonly<{ payload: string }>[], ModelFault> {
  const payloads = details
    .filter(detail => isReplayable(detail.raw))
    .map(detail => Object.freeze({ payload: payloadOf(detail) }))
  return { ok: Object.freeze(payloads) }
}

function replay(
  parts: readonly ReplayPart[],
  thinking: readonly string[],
): Outcome<ReplayWire, TransportFailure> {
  if (parts.length > 0) {
    const details: Readonly<Record<string, JsonValue>>[] = []
    for (const part of parts) {
      const item = itemOf(part)
      if (item === null)
        return {
          failure: { kind: 'invalid', field: 'reasoning_state', reason: 'payload-not-replayable' },
        }
      details.push(item)
    }
    return { ok: { kind: 'details', details } }
  }
  const text = thinking.join('')
  return { ok: text.length > 0 ? { kind: 'plain', text } : { kind: 'none' } }
}

const reasoningText: ReasoningCodec = Object.freeze({ seal, replay })

export const REASONING_RULES = {
  'qwen-reasoning-text/1': () => reasoningText,
} as const satisfies Readonly<Record<string, RuleOf<ReasoningCodec | null>>>

export type ReasoningRuleName = keyof typeof REASONING_RULES

const DECIMAL = /^(0|[1-9][0-9]*)$/
const UNIT = 'token'

function counted(name: string, lexeme: string | null): ChatUsageItem {
  return lexeme === null
    ? { name, state: 'unknown', unit: UNIT }
    : { name, state: 'known', lexeme, unit: UNIT }
}

function cacheWriteOf(usage: GatewayUsage): string | null {
  const details = usage.raw['prompt_tokens_details']
  if (details?.kind !== 'object') return null
  const value = details.entries.find(entry => entry.key === 'cache_write_tokens')?.value
  return value?.kind === 'number' && DECIMAL.test(value.lexeme) ? value.lexeme : null
}

function uncachedInput(
  usage: GatewayUsage,
  write: string | null,
): Readonly<{ lexeme: string | null; negative: boolean }> {
  const { promptTokens, cachedTokens } = usage
  if (promptTokens === null || cachedTokens === null || write === null)
    return { lexeme: null, negative: false }
  const remainder = BigInt(promptTokens) - BigInt(cachedTokens) - BigInt(write)
  return remainder < 0n
    ? { lexeme: null, negative: true }
    : { lexeme: String(remainder), negative: false }
}

function qwenUsage(usage: GatewayUsage): Outcome<ChatUsage, ModelFault> {
  const write = cacheWriteOf(usage)
  const input = uncachedInput(usage, write)
  return {
    ok: {
      items: [
        counted('input', input.lexeme),
        counted('output', usage.completionTokens),
        counted('cache-read', usage.cachedTokens),
        counted('cache-write', write),
        counted('reasoning', usage.reasoningTokens),
      ],
      diagnostics: input.negative ? [{ kind: 'usage-inconsistent', field: 'input' }] : [],
    },
  }
}

export const USAGE_RULES = {
  'qwen-usage/1': () => qwenUsage,
} as const satisfies Readonly<Record<string, RuleOf<VendorHooks['usage']>>>

export type UsageRuleName = keyof typeof USAGE_RULES

function objectRoot(record: QwenRecord): VendorHooks['toolSchema'] {
  const adapter = recordAdoption(QWEN_OWNER, record)
  return schema =>
    schema.kind === 'object'
      ? { ok: schema }
      : { failure: { kind: 'unsupported', field: 'argumentsSchema', adapter } }
}

export const TOOL_SCHEMA_RULES = {
  'object-root/1': objectRoot,
} as const satisfies Readonly<Record<string, RuleOf<VendorHooks['toolSchema']>>>

export type ToolSchemaRuleName = keyof typeof TOOL_SCHEMA_RULES

export const CHECK_RULES = {
  'none/1': () => () => ({ ok: undefined }),
} as const satisfies Readonly<Record<string, RuleOf<VendorHooks['check']>>>

export type CheckRuleName = keyof typeof CHECK_RULES

export function hooksOf(record: QwenRecord): VendorHooks {
  const reasoning: RuleOf<ReasoningCodec | null> = REASONING_RULES[record.rules.reasoning]
  const usage: RuleOf<VendorHooks['usage']> = USAGE_RULES[record.rules.usage]
  const toolSchema: RuleOf<VendorHooks['toolSchema']> = TOOL_SCHEMA_RULES[record.rules.toolSchema]
  const check: RuleOf<VendorHooks['check']> = CHECK_RULES[record.rules.check]
  return Object.freeze({
    reasoning: reasoning(record),
    usage: usage(record),
    toolSchema: toolSchema(record),
    check: check(record),
  })
}

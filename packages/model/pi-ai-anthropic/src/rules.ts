import {
  readJsonText,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import type { Adoption, ModelFault, TransportFailure } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import type {
  ChatUsage,
  ChatUsageItem,
  GatewayUsage,
  ReasoningCodec,
  ReasoningDetail,
  ReplayPart,
  ReplaySource,
  ReplayWire,
  VendorHooks,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { ANTHROPIC_OWNER } from './owner.ts'
import type { AnthropicRecord } from './record.ts'

export const ANTHROPIC_REASONING_FORMAT = 'anthropic-claude-v1'
/** The text a gateway writes in place of ciphertext it withholds. It is never a replayable item. */
const REDACTED = '[REDACTED]'

type RuleOf<H> = (record: AnthropicRecord) => H

type Item = Readonly<Record<string, JsonValue>>

function stringMember(item: Item, key: string): string | null {
  const value = item[key]
  return value?.kind === 'string' ? value.value : null
}

function hasValidIdentity(item: Item): boolean {
  const id = item['id']
  const index = item['index']
  const idValid = id === undefined || id.kind === 'null' || id.kind === 'string'
  const indexValid =
    index === undefined || (index.kind === 'number' && /^(0|[1-9][0-9]*)$/.test(index.lexeme))
  return idValid && indexValid
}

function isReplayable(item: Item): boolean {
  if (stringMember(item, 'format') !== ANTHROPIC_REASONING_FORMAT || !hasValidIdentity(item))
    return false
  switch (stringMember(item, 'type')) {
    case 'reasoning.text': {
      const signature = stringMember(item, 'signature')
      return stringMember(item, 'text') !== null && signature !== null && signature.length > 0
    }
    case 'reasoning.encrypted': {
      const data = stringMember(item, 'data')
      return data !== null && data.length > 0 && data !== REDACTED
    }
    default:
      return false
  }
}

function byKey(left: string, right: string): number {
  if (left < right) return -1
  return left > right ? 1 : 0
}

function sortedItem(item: Item): JsonValue {
  const keys = Object.keys(item).toSorted(byKey)
  return {
    kind: 'object',
    entries: keys.flatMap(key => {
      const value = item[key]
      return value === undefined ? [] : [{ key, value }]
    }),
  }
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

function itemsOf(part: ReplayPart): readonly Item[] | null {
  const read = readJsonText(part.payload, payloadLimits(part.payload))
  if (read.kind !== 'ok' || read.value.kind !== 'array' || read.value.items.length === 0)
    return null
  const items: Item[] = []
  for (const value of read.value.items) {
    if (value.kind !== 'object') return null
    const item = Object.fromEntries(value.entries.map(entry => [entry.key, entry.value]))
    if (!isReplayable(item)) return null
    items.push(item)
  }
  return items
}

function seal(
  details: readonly ReasoningDetail[],
): Outcome<readonly Readonly<{ payload: string }>[], ModelFault> {
  if (details.length === 0 || !details.every(detail => isReplayable(detail.raw))) return { ok: [] }
  const payload = writeJsonText({
    kind: 'array',
    items: details.map(detail => sortedItem(detail.raw)),
  })
  return { ok: [Object.freeze({ payload })] }
}

function signedGroup(adapter: Adoption): ReasoningCodec {
  return Object.freeze({
    seal,
    replay(
      parts: readonly ReplayPart[],
      thinking: readonly string[],
      source: ReplaySource,
    ): Outcome<ReplayWire, TransportFailure> {
      if (parts.length === 0)
        return source === 'continuable' || thinking.every(text => text.length === 0)
          ? { ok: { kind: 'none' } }
          : { failure: { kind: 'unsupported', field: 'thinking', adapter } }
      const details: Item[] = []
      for (const part of parts) {
        const items = itemsOf(part)
        if (items === null)
          return {
            failure: {
              kind: 'invalid',
              field: 'reasoning_state',
              reason: 'payload-not-replayable',
            },
          }
        details.push(...items)
      }
      return { ok: { kind: 'details', details } }
    },
  })
}

export const REASONING_RULES = {
  'anthropic-signed-group/1': record => signedGroup(recordAdoption(ANTHROPIC_OWNER, record)),
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

type Remainder =
  | Readonly<{ kind: 'known'; lexeme: string }>
  | Readonly<{ kind: 'partial' }>
  | Readonly<{ kind: 'negative' }>

function uncachedInput(usage: GatewayUsage, write: string | null): Remainder {
  const { promptTokens, cachedTokens } = usage
  if (promptTokens === null || cachedTokens === null || write === null) return { kind: 'partial' }
  const remainder = BigInt(promptTokens) - BigInt(cachedTokens) - BigInt(write)
  return remainder < 0n ? { kind: 'negative' } : { kind: 'known', lexeme: String(remainder) }
}

function anthropicUsage(usage: GatewayUsage): Outcome<ChatUsage, ModelFault> {
  const write = cacheWriteOf(usage)
  const input = uncachedInput(usage, write)
  return {
    ok: {
      items: [
        counted('input', input.kind === 'known' ? input.lexeme : null),
        counted('output', usage.completionTokens),
        counted('cache-read', usage.cachedTokens),
        counted('cache-write', write),
        counted('reasoning', usage.reasoningTokens),
      ],
      diagnostics:
        input.kind === 'negative' ? [{ kind: 'usage-inconsistent', field: 'input' }] : [],
    },
  }
}

export const USAGE_RULES = {
  'anthropic-usage/1': () => anthropicUsage,
} as const satisfies Readonly<Record<string, RuleOf<VendorHooks['usage']>>>

export type UsageRuleName = keyof typeof USAGE_RULES

function objectRoot(record: AnthropicRecord): VendorHooks['toolSchema'] {
  const adapter = recordAdoption(ANTHROPIC_OWNER, record)
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

export function hooksOf(record: AnthropicRecord): VendorHooks {
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

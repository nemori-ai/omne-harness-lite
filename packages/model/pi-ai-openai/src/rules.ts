// The revisioned rule tables of the OpenAI family: the code behind the four hooks of the gateway
// engine. A record names one rule per hook. A rule never changes its behaviour in place: a changed
// rule is a new name, and the records that use it get a new revision.
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
import { OPENAI_OWNER } from './owner.ts'
import type { OpenAiRecord } from './record.ts'

/** The replay format of OpenAI encrypted reasoning, as the gateway labels its items. */
export const OPENAI_REASONING_FORMAT = 'openai-responses-v1'
/** The text a gateway writes in place of ciphertext it withholds. It is never a replayable item. */
const REDACTED = '[REDACTED]'
const ENCRYPTED = 'reasoning.encrypted'

/** A rule: the hook of one record. */
type RuleOf<H> = (record: OpenAiRecord) => H

// --- reasoning -------------------------------------------------------------------------------

function stringMember(raw: Readonly<Record<string, JsonValue>>, key: string): string | null {
  const value = raw[key]
  return value?.kind === 'string' ? value.value : null
}

/** An encrypted item in the OpenAI format with ciphertext: the only item that replays. */
function isReplayable(raw: Readonly<Record<string, JsonValue>>): boolean {
  const data = stringMember(raw, 'data')
  return (
    stringMember(raw, 'type') === ENCRYPTED &&
    stringMember(raw, 'format') === OPENAI_REASONING_FORMAT &&
    data !== null &&
    data.length > 0 &&
    data !== REDACTED
  )
}

function byKey(left: string, right: string): number {
  if (left < right) return -1
  return left > right ? 1 : 0
}

/** The item as one JSON object with sorted keys: the payload of its reasoning state part. */
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

/** Budgets that only the length of a payload bounds; the message limit bounds that length. */
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

/** The item that a payload holds, or `null` when it is not a replayable OpenAI item. */
function itemOf(part: ReplayPart): Readonly<Record<string, JsonValue>> | null {
  const read = readJsonText(part.payload, payloadLimits(part.payload))
  if (read.kind !== 'ok' || read.value.kind !== 'object') return null
  const raw = Object.fromEntries(read.value.entries.map(entry => [entry.key, entry.value]))
  return isReplayable(raw) ? raw : null
}

/** Each encrypted OpenAI item with ciphertext is one state part; other items are not state. */
function seal(
  details: readonly ReasoningDetail[],
): Outcome<readonly Readonly<{ payload: string }>[], ModelFault> {
  const payloads = details
    .filter(detail => isReplayable(detail.raw))
    .map(detail => Object.freeze({ payload: payloadOf(detail) }))
  return { ok: Object.freeze(payloads) }
}

/**
 * The items of the carried parts go back as `reasoning_details`, in part order; native thinking
 * then stays out, because the encrypted items carry the reasoning. Thinking without parts, of a
 * continuable message or a foreign message under the rule `adapter`, goes out as plain
 * `reasoning`, so the source does not change the result.
 */
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

const openAiEncrypted: ReasoningCodec = Object.freeze({ seal, replay })

/** The reasoning rules: a codec, or `null` for a record that seals and replays nothing. */
export const REASONING_RULES = {
  'openai-encrypted/1': () => openAiEncrypted,
  'none/1': () => null,
} as const satisfies Readonly<Record<string, RuleOf<ReasoningCodec | null>>>

export type ReasoningRuleName = keyof typeof REASONING_RULES

// --- usage -----------------------------------------------------------------------------------

const DECIMAL = /^(0|[1-9][0-9]*)$/
const UNIT = 'token'

function known(name: string, lexeme: string): ChatUsageItem {
  return { name, state: 'known', lexeme, unit: UNIT }
}

function unknown(name: string): ChatUsageItem {
  return { name, state: 'unknown', unit: UNIT }
}

function counted(name: string, lexeme: string | null): ChatUsageItem {
  return lexeme === null ? unknown(name) : known(name, lexeme)
}

/** `prompt_tokens_details.cache_write_tokens`, which the decoder does not read. */
function cacheWriteOf(usage: GatewayUsage): string | null {
  const details = usage.raw['prompt_tokens_details']
  if (details?.kind !== 'object') return null
  const value = details.entries.find(entry => entry.key === 'cache_write_tokens')?.value
  return value?.kind === 'number' && DECIMAL.test(value.lexeme) ? value.lexeme : null
}

/**
 * The uncached input: prompt less cache reads and writes. `partial`: a count is missing.
 * `negative`: the cache parts exceed the prompt, so the counts contradict each other.
 */
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

/**
 * The OpenRouter usage of an OpenAI route: `input` is the uncached input, `cache-read` and
 * `cache-write` the cache parts, `output` the completion and `reasoning` its reasoning part.
 * Unknown counts stay unknown. A negative input remainder is unknown, never zero, and gives a
 * `usage-inconsistent` diagnostic for `input`.
 */
function openAiUsage(usage: GatewayUsage): Outcome<ChatUsage, ModelFault> {
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

/**
 * As `openai-usage/1`, but the scope of the prompt count is unknown, so `input` is unknown. The
 * counts can still contradict each other, so the diagnostic stays.
 */
function unknownScopeUsage(usage: GatewayUsage): Outcome<ChatUsage, ModelFault> {
  const read = openAiUsage(usage)
  if (!('ok' in read)) return read
  return {
    ok: {
      items: read.ok.items.map(item => (item.name === 'input' ? unknown('input') : item)),
      diagnostics: read.ok.diagnostics,
    },
  }
}

export const USAGE_RULES = {
  'openai-usage/1': () => openAiUsage,
  'unknown-scope/1': () => unknownScopeUsage,
} as const satisfies Readonly<Record<string, RuleOf<VendorHooks['usage']>>>

export type UsageRuleName = keyof typeof USAGE_RULES

// --- tool schema -----------------------------------------------------------------------------

/**
 * The OpenRouter function tool subset: the parameters schema must be a JSON object. It passes
 * unchanged; a schema of another kind is unsupported, never rewritten.
 */
function objectRoot(record: OpenAiRecord): VendorHooks['toolSchema'] {
  const adapter = recordAdoption(OPENAI_OWNER, record)
  return schema =>
    schema.kind === 'object'
      ? { ok: schema }
      : { failure: { kind: 'unsupported', field: 'argumentsSchema', adapter } }
}

export const TOOL_SCHEMA_RULES = {
  'object-root/1': objectRoot,
} as const satisfies Readonly<Record<string, RuleOf<VendorHooks['toolSchema']>>>

export type ToolSchemaRuleName = keyof typeof TOOL_SCHEMA_RULES

// --- check -----------------------------------------------------------------------------------

export const CHECK_RULES = {
  /** No cross-field rule: the parameter table states every OpenAI rule. */
  'none/1': () => () => ({ ok: undefined }),
} as const satisfies Readonly<Record<string, RuleOf<VendorHooks['check']>>>

export type CheckRuleName = keyof typeof CHECK_RULES

/** The four hooks of a record, from the rules it names. */
export function hooksOf(record: OpenAiRecord): VendorHooks {
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

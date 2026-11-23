import { recordAdoption } from '@omne-harness/pi-ai-transport'
import {
  reasoningTextCodec,
  usageWithCacheWrites,
  type ReasoningCodec,
  type VendorHooks,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { KIMI_OWNER } from './owner.ts'
import type { KimiRecord } from './record.ts'

type RuleOf<H> = (record: KimiRecord) => H

export const REASONING_RULES = {
  'kimi-reasoning-text/1': () => reasoningTextCodec,
} as const satisfies Readonly<Record<string, RuleOf<ReasoningCodec | null>>>

export type ReasoningRuleName = keyof typeof REASONING_RULES

export const USAGE_RULES = {
  'kimi-usage/1': () => usageWithCacheWrites,
} as const satisfies Readonly<Record<string, RuleOf<VendorHooks['usage']>>>

export type UsageRuleName = keyof typeof USAGE_RULES

function objectRoot(record: KimiRecord): VendorHooks['toolSchema'] {
  const adapter = recordAdoption(KIMI_OWNER, record)
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

export function hooksOf(record: KimiRecord): VendorHooks {
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

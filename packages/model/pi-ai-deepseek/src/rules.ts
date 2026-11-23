import type { JsonEntry, JsonValue } from '@omne-harness/json-text'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import {
  reasoningTextCodec,
  usageWithCacheWrites,
  type VendorHooks,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { DEEPSEEK_OWNER } from './owner.ts'
import type { DeepSeekRecord } from './record.ts'

function explicitObjectProperty(property: JsonEntry): JsonEntry {
  const schema = property.value
  if (schema.kind !== 'object' || schema.entries.length !== 1) return property
  const type = schema.entries[0]
  if (type?.key !== 'type' || type.value.kind !== 'string' || type.value.value !== 'object')
    return property
  return {
    key: property.key,
    value: {
      kind: 'object',
      entries: [
        { key: 'additionalProperties', value: { kind: 'boolean', value: true } },
        { key: 'properties', value: { kind: 'object', entries: [] } },
        type,
      ],
    },
  }
}

export function projectToolSchema(
  rule: DeepSeekRecord['rules']['toolSchema'],
  schema: JsonValue,
): JsonValue {
  if (rule !== 'explicit-open-object-properties/1' || schema.kind !== 'object') return schema
  return {
    kind: 'object',
    entries: schema.entries.map(entry =>
      entry.key === 'properties' && entry.value.kind === 'object'
        ? {
            key: entry.key,
            value: { kind: 'object', entries: entry.value.entries.map(explicitObjectProperty) },
          }
        : entry,
    ),
  }
}

export function hooksOf(record: DeepSeekRecord): VendorHooks {
  const adapter = recordAdoption(DEEPSEEK_OWNER, record)
  return {
    reasoning: reasoningTextCodec,
    usage: usageWithCacheWrites,
    toolSchema: schema =>
      schema.kind === 'object'
        ? { ok: projectToolSchema(record.rules.toolSchema, schema) }
        : { failure: { kind: 'unsupported', field: 'argumentsSchema', adapter } },
    check: () => ({ ok: undefined }),
  }
}

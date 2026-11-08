import type { FactCommandV2, JsonValue } from '@omne-harness/sql-contract'
import { isObject, textOf, type JsonObject } from './worker/support.ts'

export const TOOL_RECORD_CURRENT = 'tool-record-current'
export const TOOL_RECORDS_CURRENT_FACT = { key: 'tool.records-current', protocol: '1' } as const

export type ToolRecordObservation = Readonly<{
  kind: 'host' | 'call'
  name: string
  key: string
  digest: string
}>
export type ToolRecordsCurrent = Readonly<{
  tenant: string
  records: readonly ToolRecordObservation[]
}>

/** Rechecks records qualified by their owner; matching bytes alone do not authorize a caller. */
export function toolRecordCurrentFacts(request: ToolRecordsCurrent): FactCommandV2 {
  return {
    participant: TOOL_RECORD_CURRENT,
    facts: {
      request: {
        tenant: request.tenant,
        records: request.records.map(record => ({ ...record })),
      },
    },
  }
}

function keysAre(value: JsonObject, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && keys.every(key => expected.includes(key))
}
function observationOf(value: JsonValue): ToolRecordObservation | null {
  if (!isObject(value) || !keysAre(value, ['kind', 'name', 'key', 'digest'])) return null
  const { kind } = value
  if (kind !== 'host' && kind !== 'call') return null
  const name = textOf(value, 'name'),
    key = textOf(value, 'key'),
    digest = textOf(value, 'digest')
  if (name === null || key === null || digest === null) return null
  return /^sha256:[0-9a-f]{64}$/.test(digest) ? { kind, name, key, digest } : null
}

function distinctRecords(records: readonly JsonValue[]): readonly ToolRecordObservation[] | null {
  const parsed: ToolRecordObservation[] = []
  const addresses = new Set<string>()
  for (const value of records) {
    const record = observationOf(value)
    if (record === null) return null
    const address = JSON.stringify([record.kind, record.name, record.key])
    if (addresses.has(address)) return null
    addresses.add(address)
    parsed.push(record)
  }
  return parsed
}

export function parseToolRecordsCurrent(facts: JsonValue): ToolRecordsCurrent | null {
  if (!isObject(facts) || !keysAre(facts, ['request'])) return null
  const request = facts['request']
  if (!isObject(request) || !keysAre(request, ['tenant', 'records'])) return null
  const tenant = textOf(request, 'tenant'),
    records = request['records']
  if (tenant === null || !Array.isArray(records) || records.length < 1 || records.length > 3)
    return null
  const parsed = distinctRecords(records)
  return parsed === null ? null : { tenant, records: parsed }
}

import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  readJsonText,
  type JsonFailure,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'

type Quota = { readonly id: string; readonly limit: bigint }
type QuotaParse = { readonly kind: 'ok'; readonly value: Quota } | { readonly kind: 'type' }

const parsed: JsonValue[] = []

const quotaCodec = {
  parse(value: JsonValue): QuotaParse {
    parsed.push(value)
    if (value.kind !== 'object') return { kind: 'type' }
    const id = value.entries.find(entry => entry.key === 'id')?.value
    const limit = value.entries.find(entry => entry.key === 'limit')?.value
    if (id?.kind !== 'string' || limit?.kind !== 'number' || !/^[0-9]+$/.test(limit.lexeme))
      return { kind: 'type' }
    return { kind: 'ok', value: { id: id.value, limit: BigInt(limit.lexeme) } }
  },
  encode(quota: Quota): JsonValue {
    return {
      kind: 'object',
      entries: [
        { key: 'id', value: { kind: 'string', value: quota.id } },
        { key: 'limit', value: { kind: 'number', lexeme: quota.limit.toString() } },
      ],
    }
  },
}

const limits: JsonLimits = {
  maxBytes: 1_000,
  maxDepth: 4,
  maxItems: 16,
  maxMembers: 8,
  maxStringLength: 64,
  maxNumberLength: 32,
}

function loadQuota(text: string): QuotaParse | JsonFailure {
  const read = readJsonText(text, limits)
  if (read.kind !== 'ok') return read
  return quotaCodec.parse(read.value)
}

describe('consumption sample', () => {
  const tenantA: JsonValue = {
    kind: 'object',
    entries: [
      { key: 'id', value: { kind: 'string', value: 'tenant-a' } },
      { key: 'limit', value: { kind: 'number', lexeme: '9007199254740993' } },
    ],
  }

  it('the field codec parses after a successful read and keeps integers past 2^53-1', () => {
    parsed.length = 0
    expect(loadQuota('{"id":"tenant-a","limit":9007199254740993}')).toEqual({
      kind: 'ok',
      value: { id: 'tenant-a', limit: 9007199254740993n },
    })
    expect(parsed).toEqual([tenantA])
    expect(quotaCodec.encode({ id: 'tenant-a', limit: 9007199254740993n })).toEqual(tenantA)
  })

  it('the field codec does not run when the read fails', () => {
    parsed.length = 0
    expect(loadQuota('{"id":"a","id":"b","limit":1}')).toEqual({
      kind: 'duplicate-key',
      path: [],
      key: 'id',
    })
    expect(parsed).toEqual([])
  })

  it('the reader source imports only its own modules and jsonc-parser', () => {
    const source = new URL('../src/', import.meta.url)
    const specifiers = readdirSync(source)
      .filter(name => name.endsWith('.ts'))
      .flatMap(name => {
        const code = readFileSync(new URL(name, source), 'utf8')
        return [...code.matchAll(/(?:from|import)\s+'([^']+)'/g)].map(match => match[1])
      })
    expect([...new Set(specifiers)].sort()).toEqual([
      './judge.ts',
      './key-set.ts',
      './read.ts',
      './types.ts',
      './write.ts',
      'jsonc-parser',
    ])
  })
})

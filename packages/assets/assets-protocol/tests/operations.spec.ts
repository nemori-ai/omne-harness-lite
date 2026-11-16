import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import type { Codec } from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'
import { assetsProtocol } from '@omne-harness/assets-protocol'

const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const tenant = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})

function tree(value: unknown) {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error('sample is not JSON')
  return read.value
}
function expectRoundTrip(codec: Codec<any>, sample: unknown) {
  const read = codec.read(tree(sample), limits)
  expect(read.ok).toBe(true)
  if (!read.ok) return
  const written = codec.write(read.value, limits)
  expect(written.ok).toBe(true)
  if (written.ok) expect(JSON.parse(writeJsonText(written.value))).toEqual(sample)
}
const rejects = (codec: Codec<any>, sample: unknown) =>
  expect(codec.read(tree(sample), limits).ok).toBe(false)

const table = {
  'list-settings': { identity: 'login', effect: 'read', limit: 'small' },
  'describe-setting': { identity: 'login', effect: 'read', limit: 'small' },
  'set-setting': { identity: 'login', effect: 'commit', limit: 'small' },
  'clear-setting': { identity: 'login', effect: 'commit', limit: 'small' },
} as const

const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied']
const outcomes = {
  'list-settings': ['not-visible', 'conflict'],
  'describe-setting': ['not-visible', 'conflict'],
  'set-setting': ['no-change', 'not-visible', 'invalid', 'conflict', 'not-writable', 'unknown'],
  'clear-setting': ['no-change', 'not-visible', 'invalid', 'conflict', 'not-writable', 'unknown'],
} as const

const operations = assetsProtocol.operations
type Name = keyof typeof operations

const asset = { category: 'tool', name: 'shell' }
const declaration = {
  title: 'Invoke',
  purpose: 'Whether Shell may run',
  appliesAt: 'next call',
  clearEffect: 'falls back',
}
const head = { asset, item: 'invoke', revision: '7', declaration }
const views = {
  ordinary: {
    ...head,
    kind: 'ordinary',
    valueSchema: { type: 'integer', minimum: 1 },
    default: { kind: 'set', value: 3 },
    own: { kind: 'unset' },
    effective: { value: { kind: 'set', value: 3 }, source: 'default' },
    lockedBy: null,
    editable: { kind: 'yes' },
  },
  permission: {
    ...head,
    kind: 'permission',
    choices: [
      { value: 'deny', label: 'Deny', description: '', permitsOperation: false },
      { value: 'auto', label: 'Auto', description: 'no approval', permitsOperation: true },
    ],
    default: 'ask',
    own: 'auto',
    effective: { kind: 'value', value: 'ask', source: 'organization' },
    bound: ['deny', 'ask'],
    editable: { kind: 'no', reason: 'prohibited-above' },
  },
  prohibited: {
    ...head,
    kind: 'permission',
    choices: [],
    default: 'ask',
    own: null,
    effective: { kind: 'prohibited', by: 'organization' },
    bound: null,
    editable: { kind: 'no', reason: 'locked' },
  },
  secret: {
    ...head,
    kind: 'secret',
    own: 'unreadable',
    official: 'unreadable',
    editable: { kind: 'no', reason: 'not-a-source' },
  },
} as const

describe('assets/v1', () => {
  it('is assets major 1 with exactly the four setting operations and no observation', () => {
    expect(assetsProtocol.name).toBe('assets')
    expect(assetsProtocol.major).toBe(1)
    expect(Object.keys(operations).sort()).toEqual(Object.keys(table).sort())
    expect(Object.keys(assetsProtocol.observations)).toEqual([])
  })

  it.each(Object.entries(table))(
    '%s has the identity, effect and limit of the table',
    (name, row) => {
      const operation = operations[name as Name]
      expect({
        identity: operation.identity,
        effect: operation.effect,
        limit: operation.limit,
      }).toEqual(row)
      expect('countsAsAccess' in operation).toBe(false)
      expect('carriesCredential' in operation).toBe(false)
    },
  )

  it.each(Object.entries(outcomes))('%s answers the outcomes of §9', (name, own) => {
    const operation = operations[name as Name]
    expect(Object.keys(operation.outcomes).sort()).toEqual([...always, ...own].sort())
    for (const fixed of ['protocol-rejected', 'basis-unavailable', 'denied', 'unknown'])
      if (fixed in operation.outcomes)
        expect(operation.outcomes[fixed as keyof typeof operation.outcomes]).toBe(true)
  })
})

describe('bodies', () => {
  const write = { tenant, asset, item: 'invoke', operation: 'op-1', expectedRevision: '7' }

  it('every operation carries its target tenant in the body', () => {
    for (const operation of Object.values(operations))
      rejects(operation.body, { asset, item: 'invoke', after: null, limit: 10 })
  })

  it('list-settings: an asset is optional, after is the next text or null, limit is a page limit', () => {
    const codec = operations['list-settings'].body
    expectRoundTrip(codec, { tenant, after: null, limit: 100 })
    expectRoundTrip(codec, { tenant, asset: { name: 'shell' }, after: '20', limit: 1 })
    rejects(codec, { tenant, after: null, limit: 101 })
    rejects(codec, { tenant, after: null })
  })

  it('describe-setting names one item', () => {
    expectRoundTrip(operations['describe-setting'].body, { tenant, asset, item: 'invoke' })
    rejects(operations['describe-setting'].body, { tenant, asset, item: '' })
  })

  it('set-setting takes an ordinary value, a pick or a secret, never an allowed set', () => {
    const codec = operations['set-setting'].body
    expectRoundTrip(codec, { ...write, value: { kind: 'ordinary', value: { depth: [1, 'a'] } } })
    expectRoundTrip(codec, { ...write, value: { kind: 'permission', pick: 'auto' } })
    expectRoundTrip(codec, { ...write, value: { kind: 'secret', secret: 'sk' } })
    rejects(codec, { ...write, value: { kind: 'permission', pick: 'auto', allowed: ['auto'] } })
    rejects(codec, { ...write, expectedRevision: '07', value: { kind: 'permission', pick: 'a' } })
    rejects(codec, { ...write, operation: '', value: { kind: 'permission', pick: 'a' } })
  })

  it('clear-setting carries the operation and the revision it read', () => {
    const codec = operations['clear-setting'].body
    expectRoundTrip(codec, write)
    rejects(codec, { tenant, asset, item: 'invoke', operation: 'op-1' })
  })
})

describe('answers', () => {
  it('a listed page carries every kind of view, its next and its completeness', () => {
    const codec = operations['list-settings'].outcomes.succeeded
    expectRoundTrip(codec, { items: Object.values(views), next: '2', completeness: 'partial' })
    expectRoundTrip(codec, { items: [], next: null, completeness: 'complete' })
  })

  it.each(Object.entries(views))('a described %s view carries its revision', (_, view) => {
    const codec = operations['describe-setting'].outcomes.succeeded
    expectRoundTrip(codec, { item: view })
    const { revision: _revision, ...withoutRevision } = view
    rejects(codec, { item: withoutRevision })
  })

  it('a write answers the new revision, and not-writable its reason', () => {
    for (const name of ['set-setting', 'clear-setting'] as const) {
      const { succeeded, 'not-writable': notWritable } = operations[name].outcomes
      expectRoundTrip(succeeded, { revision: '8' })
      for (const reason of ['locked', 'out-of-bound', 'prohibited-above', 'not-a-source'])
        expectRoundTrip(notWritable, { reason })
      rejects(notWritable, {})
    }
  })
})

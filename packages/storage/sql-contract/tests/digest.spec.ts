// The two pure digests (SPEC section 3.2 and 4.4). Expected texts are written by hand and hashed
// with node:crypto here, so the tests do not reuse the code under test to build the expectation.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  combinationManifest,
  inputDigestV2,
  manifestDigest,
  type CommitRequestV2,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import {
  MANIFEST_VECTOR_CATALOG,
  MANIFEST_VECTOR_DIGEST,
  MANIFEST_VECTOR_PARTICIPANTS,
} from '../src/testing/manifest-vector.ts'

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

const IDENTITY = {
  scope: { kind: 'tenant', tenant: 't' },
  transactionDomain: 'd',
  operation: 'o',
  protocolVersion: '2',
  operationKey: 'k',
} as const

function request(commands: CommitRequestV2['commands']): CommitRequestV2 {
  return { identity: IDENTITY, combinationVersion: 'v1', manifestDigest: 'a'.repeat(64), commands }
}

function canonicalOf(commands: string): string {
  return `{"combinationVersion":"v1","commands":${commands},"manifestDigest":"${'a'.repeat(64)}","scope":{"kind":"tenant","tenant":"t"}}`
}

function manifestDigestOf(catalog: SqlMaterialCatalog): string {
  const result = combinationManifest({ catalog, participants: ['session', 'agent-journal'] })
  if (result.kind !== 'manifest') throw new Error(result.kind)
  return manifestDigest(result.manifest)
}

describe('manifest digest vector', () => {
  const vector = JSON.parse(
    readFileSync(new URL('./fixtures/manifest-digest-vector.json', import.meta.url), 'utf8'),
  ) as { canonicalText: string; manifestDigest: string; participants: string[] }

  it('the vector file keeps the digest of the spec and its text hashes to it', () => {
    expect(vector.manifestDigest).toBe(
      'b8cb9846fa33866cea139ff67980096603ec26d41473dbed29e1a5784329e1dd',
    )
    expect(sha(vector.canonicalText)).toBe(vector.manifestDigest)
  })

  it('manifestDigest of the vector catalog equals the vector digest byte for byte', () => {
    expect(MANIFEST_VECTOR_DIGEST).toBe(vector.manifestDigest)
    expect([...MANIFEST_VECTOR_PARTICIPANTS]).toEqual(vector.participants)
    const result = combinationManifest({
      catalog: MANIFEST_VECTOR_CATALOG,
      participants: [...MANIFEST_VECTOR_PARTICIPANTS],
    })
    if (result.kind !== 'manifest') throw new Error(result.kind)
    expect(manifestDigest(result.manifest)).toBe(vector.manifestDigest)
    expect(JSON.stringify(sortKeys(result.manifest))).toBe(vector.canonicalText)
  })

  it('does not depend on the order of participants, of catalog entries or of array members', () => {
    const reversed: SqlMaterialCatalog = {
      ...MANIFEST_VECTOR_CATALOG,
      participants: [...MANIFEST_VECTOR_CATALOG.participants].reverse().map(entry => ({
        ...entry,
        ownedTables: [...entry.ownedTables].reverse(),
      })),
      migrations: [...MANIFEST_VECTOR_CATALOG.migrations].reverse(),
    }
    expect(manifestDigestOf(reversed)).toBe(MANIFEST_VECTOR_DIGEST)
  })

  it('ignores moduleUrl', () => {
    const moved: SqlMaterialCatalog = {
      ...MANIFEST_VECTOR_CATALOG,
      participants: MANIFEST_VECTOR_CATALOG.participants.map(entry => ({
        ...entry,
        moduleUrl: 'file:///moved.js',
      })),
    }
    expect(manifestDigestOf(moved)).toBe(MANIFEST_VECTOR_DIGEST)
  })

  it('reads codeDigest', () => {
    const changed: SqlMaterialCatalog = {
      ...MANIFEST_VECTOR_CATALOG,
      participants: MANIFEST_VECTOR_CATALOG.participants.map(entry => ({
        ...entry,
        codeDigest: 'e'.repeat(64),
      })),
    }
    expect(manifestDigestOf(changed)).not.toBe(MANIFEST_VECTOR_DIGEST)
  })

  it('reads the migration checksum', () => {
    const changed: SqlMaterialCatalog = {
      ...MANIFEST_VECTOR_CATALOG,
      migrations: MANIFEST_VECTOR_CATALOG.migrations.map(entry => ({
        ...entry,
        checksum: 'e'.repeat(64),
      })),
    }
    expect(manifestDigestOf(changed)).not.toBe(MANIFEST_VECTOR_DIGEST)
  })
})

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sortKeys(item)]),
    )
  return value
}

describe('inputDigestV2', () => {
  const commands = [
    { participant: 'b', facts: { x: 1 } },
    { participant: 'a', facts: { y: 'z' } },
  ]
  const expectedText = canonicalOf(
    '[{"facts":{"y":"z"},"participant":"a"},{"facts":{"x":1},"participant":"b"}]',
  )

  it('hashes the RFC 8785 text of scope, version, digest and commands sorted by participant', () => {
    expect(inputDigestV2(request(commands))).toBe(sha(expectedText))
  })

  it('sorts commands by UTF-16 code units, so "B" comes before "a" (not localeCompare)', () => {
    const mixed = request([
      { participant: 'a', facts: {} },
      { participant: 'B', facts: {} },
    ])
    expect(inputDigestV2(mixed)).toBe(
      sha(canonicalOf('[{"facts":{},"participant":"B"},{"facts":{},"participant":"a"}]')),
    )
  })

  it('does not change with the order of commands or of object keys', () => {
    const shuffled = request([
      { facts: { y: 'z' }, participant: 'a' },
      { facts: { x: 1 }, participant: 'b' },
    ])
    expect(inputDigestV2(shuffled)).toBe(inputDigestV2(request(commands)))
  })

  it('does not include the operation identity beyond the scope', () => {
    const other = { ...request(commands), identity: { ...IDENTITY, operationKey: 'other' } }
    expect(inputDigestV2(other)).toBe(inputDigestV2(request(commands)))
  })

  it('changes with the combination version', () => {
    expect(inputDigestV2({ ...request(commands), combinationVersion: 'v2' })).not.toBe(
      inputDigestV2(request(commands)),
    )
  })

  it('changes with the manifest digest', () => {
    expect(inputDigestV2({ ...request(commands), manifestDigest: 'b'.repeat(64) })).not.toBe(
      inputDigestV2(request(commands)),
    )
  })

  it('changes with the facts', () => {
    expect(
      inputDigestV2(
        request([
          { participant: 'a', facts: { y: 'w' } },
          { participant: 'b', facts: { x: 1 } },
        ]),
      ),
    ).not.toBe(inputDigestV2(request(commands)))
  })

  it('changes with the scope', () => {
    const other = {
      ...request(commands),
      identity: { ...IDENTITY, scope: { kind: 'system' } as const },
    }
    expect(inputDigestV2(other)).not.toBe(inputDigestV2(request(commands)))
  })

  it('sorts commands by UTF-16 code units, not by code points', () => {
    const emoji = '\u{1F600}' // code units D83D DE00 sort before FFFF
    const high = '￿'
    const text = canonicalOf(
      `[{"facts":{},"participant":"${emoji}"},{"facts":{},"participant":"${high}"}]`,
    )
    const digest = inputDigestV2(
      request([
        { participant: high, facts: {} },
        { participant: emoji, facts: {} },
      ]),
    )
    expect(digest).toBe(sha(text))
  })

  it('writes keys in UTF-16 order and strings in the JSON form of RFC 8785', () => {
    const facts = { '￿': 1, '\u{1F600}': 2, b: '"\\\u0001\u007f \n', a: null }
    const text = canonicalOf(
      '[{"facts":{"a":null,"b":"\\"\\\\\\u0001\u007f \\n","\u{1F600}":2,"￿":1},"participant":"p"}]',
    )
    expect(inputDigestV2(request([{ participant: 'p', facts }]))).toBe(sha(text))
  })

  it('writes numbers in the ECMAScript form that RFC 8785 requires (section 3.2.2.3)', () => {
    const numbers = [
      1e21,
      1e-7,
      -0,
      4.5,
      1.0,
      Number('333333333.33333329'),
      1e30,
      0.000001,
      123456789012345680000,
    ]
    const text = canonicalOf(
      '[{"facts":{"n":[1e+21,1e-7,0,4.5,1,333333333.3333333,1e+30,0.000001,123456789012345680000]},"participant":"p"}]',
    )
    expect(inputDigestV2(request([{ participant: 'p', facts: { n: numbers } }]))).toBe(sha(text))
  })

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['undefined', undefined],
    ['bigint', 1n],
    ['Date', new Date(0)],
    ['function', () => 1],
  ])('refuses a %s fact instead of hashing a lossy form', (_name, value) => {
    expect(() =>
      inputDigestV2(request([{ participant: 'p', facts: { v: value as never } }])),
    ).toThrow(TypeError)
  })
})

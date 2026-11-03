import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import {
  actionPermissionItems,
  completeListing,
  digestDefinition,
  isCatalogRevision,
  isGeneration,
  isProtocolVersion,
  markUnavailable,
  mergeListing,
  type ActionCatalogRecord,
  type AdoptionBasis,
  type CatalogState,
  type CompleteListing,
  type ExpectedRevision,
} from '@omne-harness/mcp-contract'
import type { ListingPage } from '@omne-harness/mcp-contract/provider'
import { json, jsonText } from './json.ts'

function basis(generation: number): AdoptionBasis {
  const protocolVersion = '2026-07-28'
  if (!isGeneration(generation) || !isProtocolVersion(protocolVersion)) throw new Error('bad basis')
  return { generation, protocolVersion, capabilities: json({ tools: {} }) }
}

function tool(name: string, extra: Record<string, unknown> = {}): JsonValue {
  return json({ name, inputSchema: { type: 'object' }, ...extra })
}

function page(tools: readonly JsonValue[], more: Partial<Omit<ListingPage, 'tools'>> = {}) {
  return { ok: { tools, ...more } }
}

function listing(
  tools: readonly JsonValue[],
  generation = 1,
  basedOn: ExpectedRevision = 'absent',
): CompleteListing {
  const complete = completeListing({
    basedOn,
    pages: [page(tools)],
    basis: basis(generation),
    acquiredAt: '2026-11-03T00:00:00Z',
    limits: { maxPages: 10, maxActions: 100 },
  })
  if ('failure' in complete) throw new Error(`incomplete: ${complete.failure}`)
  return complete.ok
}

function adopted(record: ActionCatalogRecord): CatalogState {
  return { kind: 'acquired', record }
}

/** Merges a listing of `tools` that was based on the current revision. */
function merged(
  current: CatalogState,
  tools: readonly JsonValue[],
  generation = 1,
): ActionCatalogRecord {
  const basedOn = current.kind === 'acquired' ? current.record.revision : 'absent'
  const result = mergeListing(current, listing(tools, generation, basedOn))
  if ('failure' in result) throw new Error(`refused: ${result.failure}`)
  return result.ok
}

const notAcquired: CatalogState = { kind: 'not-acquired' }
const limits = { maxPages: 3, maxActions: 4 }
const read = {
  basis: basis(1),
  acquiredAt: '2026-11-03T00:00:00Z',
  limits,
  basedOn: 'absent',
} as const

describe('completeListing', () => {
  it('joins the pages in order and keeps the shortest freshness hint', () => {
    const complete = completeListing({
      ...read,
      pages: [
        page([tool('a')], { nextCursor: 'p2', ttlMs: 60_000 }),
        page([tool('b')], { ttlMs: 5_000 }),
      ],
    })
    if ('failure' in complete) throw new Error(complete.failure)
    expect(complete.ok.actions.map(action => action.definition.name)).toEqual(['a', 'b'])
    expect(complete.ok.freshness).toEqual({
      acquiredAt: '2026-11-03T00:00:00Z',
      ttlMs: 5_000,
      changedNotified: false,
    })
  })

  it('adopts nothing when any page failed, even when earlier pages were read', () => {
    const failed = { failure: { kind: 'no-answer', cause: 'stream-broken' } } as const
    expect(
      completeListing({ ...read, pages: [page([tool('a')], { nextCursor: 'p2' }), failed] }),
    ).toEqual({ failure: 'page-failed' })
  })

  it('refuses a listing whose last page still names a next page', () => {
    expect(completeListing({ ...read, pages: [page([tool('a')], { nextCursor: 'p2' })] })).toEqual({
      failure: 'pages-unfinished',
    })
    expect(completeListing({ ...read, pages: [] })).toEqual({ failure: 'pages-unfinished' })
  })

  it('refuses a listing that needs more pages than the bound', () => {
    const pages = [1, 2, 3].map(index => page([tool(`a${index}`)], { nextCursor: `p${index}` }))
    expect(completeListing({ ...read, pages })).toEqual({ failure: 'page-limit-exceeded' })
  })

  it('refuses a listing with more pages than the bound even when the last page is final', () => {
    const pages = [1, 2, 3, 4].map(index =>
      page([tool(`a${index}`)], index === 4 ? {} : { nextCursor: `p${index}` }),
    )
    expect(completeListing({ ...read, pages })).toEqual({ failure: 'page-limit-exceeded' })
  })

  it('takes the shortest freshness hint in either page order', () => {
    const complete = completeListing({
      ...read,
      pages: [page([], { nextCursor: 'p2', ttlMs: 5_000 }), page([], { ttlMs: 60_000 })],
    })
    expect('ok' in complete && complete.ok.freshness.ttlMs).toBe(5_000)
  })

  it('gives no freshness hint when no page gives one', () => {
    const complete = completeListing({ ...read, pages: [page([tool('a')])] })
    expect('ok' in complete && complete.ok.freshness).toStrictEqual({
      acquiredAt: '2026-11-03T00:00:00Z',
      changedNotified: false,
    })
  })

  it('refuses a listing with more actions than the bound', () => {
    const tools = ['a', 'b', 'c', 'd', 'e'].map(name => tool(name))
    expect(completeListing({ ...read, pages: [page(tools)] })).toEqual({
      failure: 'action-limit-exceeded',
    })
  })

  it('refuses a repeated action name across pages', () => {
    expect(
      completeListing({
        ...read,
        pages: [page([tool('a')], { nextCursor: 'p2' }), page([tool('a')])],
      }),
    ).toEqual({ failure: 'duplicate-action-name' })
  })

  const invalid: readonly (readonly [string, JsonValue])[] = [
    ['not an object', json('a')],
    ['no name', json({ inputSchema: { type: 'object' } })],
    ['an empty name', tool('')],
    ['no input schema', json({ name: 'a' })],
    ['an output schema that is not an object', tool('a', { outputSchema: true })],
    ['annotations that are not an object', tool('a', { annotations: [] })],
  ]

  for (const [name, definition] of invalid)
    it(`refuses an action definition with ${name}`, () => {
      expect(completeListing({ ...read, pages: [page([definition])] })).toEqual({
        failure: 'action-invalid',
      })
    })

  it('keeps the definition as written and holds the annotations apart as untrusted', () => {
    const raw = {
      name: 'search',
      title: 'Search',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      icons: [{ src: 'https://example.test/icon.png' }],
      annotations: { readOnlyHint: true },
      _meta: { 'example.test/x': 1.5 },
    }
    const complete = listing([json(raw)])
    const [action] = complete.actions
    const { annotations, ...rest } = raw
    expect(action?.definition).toEqual({
      name: 'search',
      outputSchema: json(raw.outputSchema),
      definition: json(rest),
      annotations: { untrusted: json(annotations) },
    })
  })
})

describe('digestDefinition', () => {
  const definitionOf = (raw: JsonValue) => {
    const action = listing([raw]).actions[0]
    if (action === undefined) throw new Error('no action')
    return action.definition
  }

  it('is the digest that the listing carries', () => {
    const complete = listing([tool('a')])
    const action = complete.actions[0]
    expect(action?.digest).toBe(action === undefined ? '' : digestDefinition(action.definition))
  })

  it('does not depend on member order', () => {
    const left = json({ name: 'a', inputSchema: { type: 'object', title: 't' } })
    const right = json({ inputSchema: { title: 't', type: 'object' }, name: 'a' })
    expect(digestDefinition(definitionOf(left))).toBe(digestDefinition(definitionOf(right)))
  })

  it('changes when the description, the schema, a number lexeme or the annotations change', () => {
    const base = digestDefinition(definitionOf(tool('a')))
    const variants = [
      tool('a', { description: 'd' }),
      json({ name: 'a', inputSchema: { type: 'object', required: [] } }),
      tool('a', { _meta: { n: 1 } }),
      tool('a', { annotations: { readOnlyHint: true } }),
    ]
    const digests = variants.map(raw => digestDefinition(definitionOf(raw)))
    expect(new Set([base, ...digests]).size).toBe(5)
    const lexeme = jsonText('{"name":"a","inputSchema":{"type":"object"},"_meta":{"n":1.0}}')
    expect(digestDefinition(definitionOf(lexeme))).not.toBe(digests[2])
  })
})

describe('mergeListing', () => {
  it('turns the first complete listing into revision 1 with every action available', () => {
    const record = merged(notAcquired, [tool('d'), tool('b'), tool('c'), tool('a')])
    expect(record.revision).toBe(1)
    expect(record.basis).toEqual(basis(1))
    expect(record.actions.map(action => [action.name, action.availability.kind])).toEqual([
      ['a', 'available'],
      ['b', 'available'],
      ['c', 'available'],
      ['d', 'available'],
    ])
  })

  it('sorts a long listing given in reverse order', () => {
    const names = Array.from({ length: 100 }, (_, index) => `a${String(index).padStart(3, '0')}`)
    const record = merged(
      notAcquired,
      [...names].reverse().map(name => tool(name)),
    )
    expect(record.actions.map(action => action.name)).toEqual(names)
  })

  it('records an empty listing as acquired with zero actions', () => {
    const record = merged(notAcquired, [])
    expect(record).toMatchObject({ revision: 1, actions: [] })
    expect(actionPermissionItems(adopted(record))).toEqual([])
  })

  it('keeps an action that the peer no longer offers, with its last lawful definition', () => {
    const first = merged(notAcquired, [tool('a', { description: 'old' }), tool('b')])
    const second = merged(adopted(first), [tool('b')], 2)
    const a = second.actions.find(action => action.name === 'a')
    expect(second.revision).toBe(2)
    expect(a).toEqual({
      ...first.actions.find(action => action.name === 'a'),
      availability: { kind: 'unavailable', reason: 'no-longer-offered' },
    })
    expect(second.basis.generation).toBe(2)
  })

  it('replaces the definition of an offered action and makes it available again', () => {
    const first = merged(notAcquired, [tool('a')])
    const gone = merged(adopted(first), [])
    const back = merged(adopted(gone), [tool('a', { description: 'new' })])
    const [a] = back.actions
    expect(a?.availability).toEqual({ kind: 'available' })
    expect(a?.lastLawful.definition).toEqual(tool('a', { description: 'new' }))
    expect(a?.definitionDigest).not.toBe(first.actions[0]?.definitionDigest)
  })

  it('refuses a result based on an older revision and leaves the newer adoption alone', () => {
    const first = merged(notAcquired, [tool('a')])
    const second = merged(adopted(first), [tool('b')])
    expect(mergeListing(adopted(second), listing([tool('c')], 1, first.revision))).toEqual({
      failure: 'stale-revision',
    })
    expect(mergeListing(adopted(second), listing([tool('c')], 1, 'absent'))).toEqual({
      failure: 'stale-revision',
    })
    expect(mergeListing(notAcquired, listing([tool('c')], 1, second.revision))).toEqual({
      failure: 'stale-revision',
    })
  })

  it('checks the revision that the listing was read against, not one the caller gives later', () => {
    const first = merged(notAcquired, [tool('a')])
    const readBeforeSecond = listing([tool('late')], 1, first.revision)
    const second = merged(adopted(first), [tool('b')])
    expect(mergeListing(adopted(second), readBeforeSecond)).toEqual({ failure: 'stale-revision' })
  })

  it('throws for a listing that completeListing did not build, even a copy of one', () => {
    const copy = { ...listing([tool('a')]) }
    expect(() => mergeListing(notAcquired, copy)).toThrow(TypeError)
  })

  it('keeps a frozen copy of the basis, not the caller object', () => {
    const given = { ...basis(1) }
    const complete = completeListing({ ...read, basis: given, pages: [page([tool('a')])] })
    if ('failure' in complete) throw new Error(complete.failure)
    expect(complete.ok.basis).toStrictEqual(given)
    expect(complete.ok.basis).not.toBe(given)
    expect(Object.isFrozen(complete.ok.basis)).toBe(true)
  })

  it('freezes the listing, its action list and each action', () => {
    const complete = listing([tool('a')])
    expect(Object.isFrozen(complete)).toBe(true)
    expect(Object.isFrozen(complete.actions)).toBe(true)
    expect(Object.isFrozen(complete.actions[0])).toBe(true)
  })

  it('keeps every known action through any sequence of listings (seeded walk)', () => {
    let seed = 7
    const next = (bound: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed % bound
    }
    const names = ['a', 'b', 'c', 'd', 'e', 'f']
    let state: CatalogState = notAcquired
    const seen = new Map<string, JsonValue>()
    for (let round = 1; round <= 200; round += 1) {
      const offered = names.filter(() => next(2) === 1)
      const tools = offered.map(name => tool(name, { description: `r${next(3)}` }))
      const record = merged(state, tools, round)
      tools.forEach((raw, index) => seen.set(offered[index] ?? '', raw))
      expect(record.revision).toBe(round)
      expect(record.actions.map(action => action.name)).toEqual([...seen.keys()].sort())
      for (const action of record.actions) {
        expect(action.lastLawful.definition).toEqual(seen.get(action.name))
        expect(action.availability.kind === 'available').toBe(offered.includes(action.name))
      }
      state = adopted(record)
    }
  })
})

describe('revision exhaustion', () => {
  const max = Number.MAX_SAFE_INTEGER
  if (!isCatalogRevision(max)) throw new Error('bad revision')
  const atMax = { ...merged(notAcquired, [tool('a')]), revision: max }

  it('throws RangeError instead of giving a revision past the safe range', () => {
    expect(() => markUnavailable(atMax, 'connection-unavailable')).toThrow(RangeError)
    expect(() => mergeListing(adopted(atMax), listing([tool('a')], 1, max))).toThrow(RangeError)
  })
})

describe('markUnavailable', () => {
  it('replaces an earlier connection reason with the new one', () => {
    const first = merged(notAcquired, [tool('a'), tool('b')])
    const lost = markUnavailable(first, 'connection-unavailable')
    const marked = markUnavailable(lost, 'credential-unavailable')
    expect(marked.actions.map(action => action.availability)).toEqual([
      { kind: 'unavailable', reason: 'credential-unavailable' },
      { kind: 'unavailable', reason: 'credential-unavailable' },
    ])
  })

  it('marks every action unavailable with the reason, keeps definitions, and raises the revision', () => {
    const first = merged(notAcquired, [tool('a'), tool('b')])
    const marked = markUnavailable(first, 'credential-unavailable')
    expect(marked.revision).toBe(2)
    expect(marked.basis).toEqual(first.basis)
    expect(marked.actions).toEqual(
      first.actions.map(action => ({
        ...action,
        availability: { kind: 'unavailable', reason: 'credential-unavailable' },
      })),
    )
  })

  it('keeps the reason of an action that the peer no longer offers', () => {
    const first = merged(notAcquired, [tool('a'), tool('b')])
    const second = merged(adopted(first), [tool('b')])
    const marked = markUnavailable(second, 'connection-unavailable')
    expect(marked.actions.map(action => action.availability)).toEqual([
      { kind: 'unavailable', reason: 'no-longer-offered' },
      { kind: 'unavailable', reason: 'connection-unavailable' },
    ])
  })
})

describe('actionPermissionItems', () => {
  it('derives nothing before a catalog was acquired', () => {
    expect(actionPermissionItems(notAcquired)).toBe('not-acquired')
  })

  it('names one item per known action, available or not, by the action name only', () => {
    const first = merged(notAcquired, [tool('read'), tool('write')])
    const second = merged(adopted(first), [tool('read', { description: 'changed' })])
    expect(actionPermissionItems(adopted(second))).toEqual(['execute:read', 'execute:write'])
  })
})

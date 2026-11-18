import { describe, expect, it } from 'vitest'
import { fetchClosed } from '../src/cordis/item-read.ts'
import { SharedMap } from '../src/journal/shared-map.ts'
import { emptySessionView, type PublishedBatch } from '../src/journal/index.ts'
import { custodyKey, handoffKey } from '../src/journal/view.ts'
import { canonicalOfKept } from '../src/testing/canonical.ts'
import { itemText, landClosed, type ItemRef } from '../src/testing/closed-items.ts'
import {
  custodyBasis,
  custodyChain,
  validatedCustody,
} from '../src/testing/journal-handoff-checks.ts'
import { evidence } from './fixtures/journal-facts.ts'

// The checks of a custody attempt and what they read, a branch at a time.

const EXECUTION = 'exe_custody_checks' as never
const H = { kind: 'execution' as const, execution: EXECUTION, operation: 'h-1' as never }
const REQUEST = { kind: 'execution', reference: H, candidate: 'reply' } as never
const ORIGINAL = { kind: 'recorded', outcome: { request: REQUEST, record: 'r-1' } } as never
const OTHER = { kind: 'recorded', outcome: { request: REQUEST, record: 'r-other' } } as never

const record = (resolution: unknown = null) =>
  ({ handoff: H, request: REQUEST, resolution, history: { kind: 'pending' } }) as never
const attemptOf = (original: unknown, predecessor: string | null) =>
  ({
    handoff: H,
    original,
    custody: predecessor === null ? null : { predecessor: { operation: predecessor } },
  }) as never
const basisOf = (held: unknown, attempts: readonly (readonly [string, unknown])[] = []) =>
  ({ record: held, groups: new Map([[canonicalOfKept(H), attempts]]) }) as never
const root = (operation: string, original: unknown = ORIGINAL) =>
  ({ operation, original, custody: null }) as never
const successor = (operation: string, predecessor: string, prior: readonly string[]) =>
  ({
    operation,
    original: ORIGINAL,
    custody: {
      custodyRoot: 'rh-1',
      predecessor: { operation: predecessor },
      priorExcluded: prior.map((item, index) => ({
        operation: item,
        predecessor: index === 0 ? null : prior[index - 1],
      })),
    },
  }) as never
const excluded = (...operations: string[]) => ({
  root: 'rh-1' as never,
  chain: operations.map((operation, index) => ({
    operation: operation as never,
    predecessor: (index === 0 ? null : operations[index - 1]) as never,
    state: 'excluded' as const,
  })),
  committed: null,
})

describe('a root custody attempt', () => {
  it('is refused when the hand-off has no record, or another request stands on the record', () => {
    const missing = {
      failure: expect.objectContaining({
        kind: 'invalid',
        field: 'original',
        reason: 'the request is not on the authoritative record',
      }),
    }
    expect(validatedCustody(basisOf(undefined), root('rh-1'), REQUEST, null)).toEqual(missing)
    const another = { ...(REQUEST as object), candidate: 'another' } as never
    expect(validatedCustody(basisOf(record()), root('rh-1'), another, null)).toEqual(missing)
  })

  it('conflicts when the record is resolved otherwise, and is taken when resolved the same', () => {
    expect(validatedCustody(basisOf(record(OTHER)), root('rh-1'), REQUEST, null)).toEqual({
      failure: { kind: 'conflict', operation: 'rh-1' },
    })
    expect(validatedCustody(basisOf(record(ORIGINAL)), root('rh-1'), REQUEST, null)).toEqual({
      ok: { handoff: H, original: ORIGINAL, custody: null },
    })
  })

  it('is refused when another root stands, and taken again when it is the root that stands', () => {
    const standing = excluded()
    expect(validatedCustody(basisOf(record()), root('rh-other'), REQUEST, standing)).toEqual({
      failure: expect.objectContaining({
        field: 'operation',
        reason: 'the H already has its custody root',
      }),
    })
    expect(validatedCustody(basisOf(record()), root('rh-1'), REQUEST, standing)).toHaveProperty(
      'ok',
    )
  })
})

describe('a successor custody attempt', () => {
  const held = [['rh-1', attemptOf(ORIGINAL, null)]] as const

  it('is refused without a chain, or under another root', () => {
    const refused = {
      failure: expect.objectContaining({
        field: 'operation',
        reason: 'the custody root is not the root of this H',
      }),
    }
    const next = successor('rh-2', 'rh-1', ['rh-1'])
    expect(validatedCustody(basisOf(record(), held), next, REQUEST, null)).toEqual(refused)
    const other = { ...excluded('rh-1'), root: 'rh-0' as never }
    expect(validatedCustody(basisOf(record(), held), next, REQUEST, other)).toEqual(refused)
  })

  it('conflicts when the root attempt is not known, or recorded another outcome', () => {
    const conflict = { failure: { kind: 'conflict', operation: 'rh-2' } }
    const next = successor('rh-2', 'rh-1', ['rh-1'])
    expect(validatedCustody(basisOf(record()), next, REQUEST, excluded('rh-1'))).toEqual(conflict)
    const noGroup = { record: record(), groups: new Map() } as never
    expect(validatedCustody(noGroup, next, REQUEST, excluded('rh-1'))).toEqual(conflict)
    const otherwise = [['rh-1', attemptOf(OTHER, null)]] as const
    expect(validatedCustody(basisOf(record(), otherwise), next, REQUEST, excluded('rh-1'))).toEqual(
      conflict,
    )
  })

  it('must follow the last attempt of the chain, which must be excluded', () => {
    const next = successor('rh-3', 'rh-1', ['rh-1'])
    expect(
      validatedCustody(basisOf(record(), held), next, REQUEST, excluded('rh-1', 'rh-2')),
    ).toEqual({
      failure: expect.objectContaining({
        field: 'operation',
        reason: 'the predecessor is not the last attempt',
      }),
    })
    expect(validatedCustody(basisOf(record(), held), next, REQUEST, excluded())).toEqual({
      failure: expect.objectContaining({ reason: 'the predecessor is not the last attempt' }),
    })
    const committed = {
      root: 'rh-1' as never,
      chain: [{ operation: 'rh-1' as never, predecessor: null, state: 'committed' as const }],
      committed: 'rh-1' as never,
    }
    expect(
      validatedCustody(
        basisOf(record(), held),
        successor('rh-2', 'rh-1', ['rh-1']),
        REQUEST,
        committed,
      ),
    ).toEqual({
      failure: expect.objectContaining({
        field: 'operation',
        reason: 'the predecessor is not permanently excluded',
      }),
    })
  })

  it('is taken when it follows the excluded chain it names', () => {
    const next = successor('rh-2', 'rh-1', ['rh-1'])
    expect(
      validatedCustody(basisOf(record(), held), next, REQUEST, excluded('rh-1')),
    ).toHaveProperty('ok')
    const third = successor('rh-3', 'rh-2', ['rh-1', 'rh-2'])
    expect(
      validatedCustody(basisOf(record(), held), third, REQUEST, excluded('rh-1', 'rh-2')),
    ).toHaveProperty('ok')
  })

  it('must name the excluded chain of the root, attempt by attempt and link by link', () => {
    const refused = {
      failure: expect.objectContaining({
        field: 'operation',
        reason: 'the exclusion chain is not the chain of the root',
      }),
    }
    const chain = excluded('rh-1', 'rh-2')
    const naming = (prior: readonly (readonly [string, string | null])[]) => {
      const next = successor('rh-3', 'rh-2', []) as { custody: object }
      const priorExcluded = prior.map(([operation, predecessor]) => ({ operation, predecessor }))
      return { ...next, custody: { ...next.custody, priorExcluded } } as never
    }
    const checked = (prior: readonly (readonly [string, string | null])[]) =>
      validatedCustody(basisOf(record(), held), naming(prior), REQUEST, chain)
    expect(checked([['rh-1', null]])).toEqual(refused)
    expect(
      checked([
        ['rh-1', null],
        ['rh-x', 'rh-1'],
      ]),
    ).toEqual(refused)
    expect(
      checked([
        ['rh-1', 'rh-0'],
        ['rh-2', 'rh-1'],
      ]),
    ).toEqual(refused)
    expect(
      checked([
        ['rh-1', null],
        ['rh-2', null],
      ]),
    ).toEqual(refused)
    expect(
      checked([
        ['rh-1', null],
        ['rh-2', 'rh-1'],
      ]),
    ).toHaveProperty('ok')
  })
})

describe('the custody chain', () => {
  it('an excluded root with no successor has no committed attempt', () => {
    const attempts = [['rh-1' as never, attemptOf(ORIGINAL, null)]] as never
    expect(custodyChain(attempts, () => 'excluded')).toEqual({
      root: 'rh-1',
      chain: [{ operation: 'rh-1', predecessor: null, state: 'excluded' }],
      committed: null,
    })
  })
})

describe('what a custody attempt is checked against', () => {
  const blobs = new Map<string, unknown>([['outcome', (ORIGINAL as { outcome: unknown }).outcome]])
  const tableOf = () => {
    const closed = new SharedMap<string, unknown>()
    closed.set(itemText({ execution: EXECUTION, family: 'handoff', item: handoffKey(H) }), {
      handoff: H,
      prepared: null,
      resolved: {
        resolution: 'recorded',
        outcome: { digest: 'outcome', size: 1 },
        history: null,
        op: 'op-2',
        digest: 'd',
        pub: 2,
        revision: 2,
      },
      retired: null,
    })
    for (const [op, pub] of [
      ['rh-2', 5],
      ['rh-1', 4],
    ] as const)
      closed.set(
        itemText({ execution: EXECUTION, family: 'custody', item: custodyKey(H, op as never) }),
        {
          handoff: H,
          resolution: 'recorded',
          outcome: { digest: 'outcome', size: 1 },
          predecessor: null,
          custody: null,
          op,
          pub,
        },
      )
    return { closed, closedComplete: true, blobs }
  }
  const executionOf = (held: readonly string[], open = false) =>
    ({
      id: EXECUTION,
      state: { kind: 'advancing' },
      handoffs: open ? [{ handoff: H, request: REQUEST }] : [],
      custodyAttempts: new Map(held.map(op => [op, attemptOf(ORIGINAL, null)])),
    }) as never

  it('for an open hand-off: its record and the attempts the core holds', () => {
    const basis = custodyBasis(tableOf(), executionOf(['rh-9'], true), H, true)
    expect(basis.record).toMatchObject({ handoff: H })
    expect(basis.groups.get(canonicalOfKept(H))?.map(([op]) => op)).toEqual(['rh-9'])
  })

  it('for a closed hand-off that must be known: the record and attempts read back, in the order they were recorded, then the ones the core alone holds', () => {
    const basis = custodyBasis(tableOf(), executionOf(['rh-2', 'rh-held']), H, true)
    expect(basis.record).toMatchObject({ handoff: H, resolution: { kind: 'recorded' } })
    expect(basis.groups.get(canonicalOfKept(H))?.map(([op]) => op)).toEqual([
      'rh-1',
      'rh-2',
      'rh-held',
    ])
  })

  it('for a closed hand-off that must be known and a core that holds no attempt: the ones read back, and no other', () => {
    const basis = custodyBasis(tableOf(), executionOf([]), H, true)
    expect(basis.groups.get(canonicalOfKept(H))?.map(([op]) => op)).toEqual(['rh-1', 'rh-2'])
  })

  it('for a closed hand-off that need not be known: nothing is read back', () => {
    const basis = custodyBasis(tableOf(), executionOf(['rh-held']), H, false)
    expect(basis.record).toBeUndefined()
    expect(basis.groups.get(canonicalOfKept(H))?.map(([op]) => op)).toEqual(['rh-held'])
  })
})

describe('landing again and reading back', () => {
  const fence = (pub: number): PublishedBatch => ({
    execution: EXECUTION,
    envelope: {
      op: `op-${String(pub)}` as never,
      digest: `d-${String(pub)}`,
      rev: 0,
      gen: '1',
      kinds: [],
    },
    facts: [
      {
        kind: 'fence.started',
        operation: 'top_a' as never,
        guard: { owner: 'agent', resource: 'attachment', revision: '1', evidence: evidence('g') },
        fence: evidence('fence'),
      },
    ],
    pub,
  })

  it('a batch landed without the check keeps the items it closed', () => {
    const table = { closed: new SharedMap<string, unknown>(), closedComplete: true }
    landClosed(table, emptySessionView(), fence(1))
    expect(
      table.closed.has(itemText({ execution: EXECUTION, family: 'fence', item: 'top_a' })),
    ).toBe(true)
  })

  it('items by key and items under a prefix are asked for apart, each by its own read', async () => {
    const lender = {
      tenantText: 'tenant',
      session: 'session',
      fetched: new Map<string, unknown>(),
      lentBlocks: new Map<string, string>(),
    }
    const asked: { handler: string; input: Record<string, unknown> }[] = []
    const read = async (handler: string, input: Record<string, unknown>) => {
      asked.push({ handler, input })
      return { kind: 'unread' as const, reason: `scripted-${String(asked.length)}` }
    }
    const refs: ItemRef[] = [
      { execution: EXECUTION, family: 'custody', item: 'h/', under: true },
      { execution: EXECUTION, family: 'handoff', item: 'h' },
    ]
    expect(await fetchClosed(read as never, lender, refs)).toContain('scripted-1')
    expect(asked).toHaveLength(1)
    expect(asked[0]?.input).toMatchObject({ keys: [{ family: 'handoff', item: 'h' }] })
    // With nothing by key, the read under the prefix is the first one.
    asked.length = 0
    expect(await fetchClosed(read as never, lender, [refs[0]!])).toContain('scripted-1')
    expect(asked[0]?.input).not.toHaveProperty('keys')
    expect(JSON.stringify(asked[0]?.input)).toContain('h/')
  })
})

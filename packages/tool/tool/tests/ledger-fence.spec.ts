import { describe, expect, it } from 'vitest'
import type { ToolResultVersion } from '@omne-harness/tool-contract'
import {
  inReachOf,
  isProgramSettled,
  owesDisposal,
  type PositionStop,
  type PositionTarget,
  type ProgramFence,
  type ProgramTable,
} from '@omne-harness/tool-contract/provider'
import { hasPendingWork } from '../src/ledger-pending.ts'
import { decideStop, runningCallSnapshot } from './control-decider-values.ts'
import type { CallSnapshot } from './resumption-decider-values.ts'
import { createToolPositions } from '../src/ledger-positions.ts'
import {
  admission,
  callId,
  guards,
  harness,
  ok,
  operationId,
  principalA,
  tenantA,
} from './runtime-values.ts'

const parent = { principal: principalA, tenant: tenantA, call: callId('call-1') }
const target: PositionTarget = { name: 'Files', command: 'read', digest: 'sha256:files' }
const at = (ordinal: number) => ({
  ...parent,
  ordinal,
  child: callId(`child-${String(ordinal)}`),
  admission: operationId(`child-op-${String(ordinal)}`),
  target,
})
const retained = (ordinal: number) => ({
  ...parent,
  ordinal,
  result: 'result-1' as ToolResultVersion,
  terminal: { kind: 'interrupted', cause: { kind: 'control' } } as never,
  effect: { kind: 'unknown' } as never,
})

type Asked = Readonly<{ ordinal: number; call: string }>

/** A parent call with a table, and the two things a host does for a position behind the barrier. */
async function world(
  stop: (ordinal: number) => PositionStop = () => 'accepted',
  unbarred: readonly number[] = [],
) {
  const assembly = harness()
  ok(await assembly.ledger.admissions.admit(admission('call-1', 'op-1')))
  const barred: Asked[] = []
  const stopped: Asked[] = []
  const children = createToolPositions({
    store: assembly.store,
    access: guards().access,
    commitAttempts: 8,
    lookup: assembly.ledger.reads.lookup,
    bar: async input => {
      barred.push({ ordinal: input.ordinal, call: input.call })
      return unbarred.includes(input.ordinal)
        ? { failure: { kind: 'unavailable', dependency: 'start-guards', diagnostic: 'down' } }
        : { ok: null }
    },
    stop: async input => {
      stopped.push({ ordinal: input.ordinal, call: input.call })
      return stop(input.ordinal)
    },
  })
  /** Registers and hands off; with `accepted` the child is a call the ledger has. */
  const hand = async (ordinal: number, accepted = true) => {
    ok(await children.register(at(ordinal)))
    ok(await children.handOff({ ...parent, ordinal }))
    if (accepted)
      ok(
        await assembly.ledger.admissions.admit(
          admission(`child-${String(ordinal)}`, `child-op-${String(ordinal)}`),
        ),
      )
  }
  const states = async () =>
    ok(await children.table(parent)).positions.map(one => [
      one.ordinal,
      one.state,
      ...(one.state === 'handed' && one.stop !== undefined ? [one.stop] : []),
      ...(one.state === 'excluded' ? [one.exclusion.kind] : []),
    ])
  return { ...assembly, children, hand, states, barred, stopped }
}

describe('TL-66 the closing barrier closes registration', () => {
  it('registers and hands off nothing after it, and says so by name', async () => {
    const { children } = await world()
    ok(await children.register(at(1)))
    const closed = ok(await children.close({ ...parent, reach: 'all', cause: 'stopped' }))
    expect(closed.phase).toBe('closing')
    expect(await children.register(at(2))).toMatchObject({
      failure: { kind: 'invalid', field: 'position', reason: 'table-closed' },
    })
    expect(await children.handOff({ ...parent, ordinal: 1 })).toMatchObject({
      failure: { kind: 'invalid', field: 'position', reason: 'table-closed' },
    })
    // The same position asked again is still read back: a repeat is not a new registration.
    expect(ok(await children.register(at(1))).state).toBe('registered')
  })

  it('keeps what was handed off before it readable, and still retains its result', async () => {
    const { children, hand, states } = await world()
    await hand(1)
    ok(await children.close({ ...parent, reach: 'all', cause: 'failed' }))
    expect(ok(await children.handOff({ ...parent, ordinal: 1 })).state).toBe('handed')
    ok(await children.retain(retained(1)))
    expect(await states()).toEqual([[1, 'retained']])
  })
})

describe('TL-69 the reach, the cause and the cut of the barrier', () => {
  it('writes the reach, the cause and where each open position was, in one commit', async () => {
    const { children, hand } = await world()
    await hand(1)
    await hand(2)
    ok(await children.background({ ...parent, ordinal: 2 }))
    ok(await children.register(at(3)))
    await hand(4)
    ok(await children.retain(retained(4)))
    const table = ok(await children.close({ ...parent, reach: 'foreground', cause: 'withdrawn' }))
    expect(table.fence).toEqual({
      reach: 'foreground',
      cause: 'withdrawn',
      cut: [
        { ordinal: 1, relation: 'foreground' },
        { ordinal: 2, relation: 'background' },
        { ordinal: 3, relation: 'unplaced' },
      ],
    })
    expect(ok(await children.table(parent)).fence).toEqual(table.fence)
  })

  it('only widens: a stop after a withdrawal reaches all, and the cause and the cut stay', async () => {
    const { children, hand } = await world()
    await hand(1)
    ok(await children.background({ ...parent, ordinal: 1 }))
    const first = ok(await children.close({ ...parent, reach: 'foreground', cause: 'withdrawn' }))
    await hand(2).catch(() => undefined)
    const wider = ok(await children.close({ ...parent, reach: 'all', cause: 'stopped' }))
    expect(wider.fence).toEqual({ ...first.fence, reach: 'all' })
    const narrower = ok(await children.close({ ...parent, reach: 'foreground', cause: 'failed' }))
    expect(narrower.fence).toEqual(wider.fence)
  })

  it('a closed table is not sealed afterwards, and never reads as settled for completion', async () => {
    const { children } = await world()
    ok(await children.close({ ...parent, reach: 'all', cause: 'stopped' }))
    const table = ok(await children.seal(parent))
    expect(table.phase).toBe('closing')
    expect(table.fence?.cause).toBe('stopped')
    expect(isProgramSettled(table)).toBe(false)
  })

  it('reaches every position when it reaches all, and spares the background of the cut otherwise', () => {
    const cut: ProgramFence['cut'] = [
      { ordinal: 1, relation: 'foreground' },
      { ordinal: 2, relation: 'background' },
      { ordinal: 3, relation: 'unplaced' },
    ]
    const some: ProgramFence = { reach: 'foreground', cause: 'withdrawn', cut }
    expect([1, 2, 3, 9].map(ordinal => inReachOf(some, ordinal))).toEqual([true, false, true, true])
    expect([1, 2, 3].map(ordinal => inReachOf({ ...some, reach: 'all' }, ordinal))).toEqual([
      true,
      true,
      true,
    ])
  })
})

describe('TL-70 every position the barrier reaches gets its step', () => {
  it('excludes what was only registered, bars and stops what was accepted, and excludes what was not', async () => {
    const { children, hand, states, barred, stopped } = await world()
    ok(await children.register(at(1)))
    await hand(2)
    await hand(3, false)
    ok(await children.close({ ...parent, reach: 'all', cause: 'failed' }))
    expect(owesDisposal(ok(await children.table(parent))).map(one => one.ordinal)).toEqual([
      1, 2, 3,
    ])
    ok(await children.dispose(parent))
    expect(await states()).toEqual([
      [1, 'excluded', 'closed'],
      [2, 'handed', 'accepted'],
      [3, 'excluded', 'closed'],
    ])
    // TL-66: the start of each handed-off child is barred before anything is asked of it.
    expect(barred).toEqual([
      { ordinal: 2, call: 'child-2' },
      { ordinal: 3, call: 'child-3' },
    ])
    expect(stopped).toEqual([{ ordinal: 2, call: 'child-2' }])
    expect(owesDisposal(ok(await children.table(parent)))).toEqual([])
  })

  it('a position whose start cannot be barred is not asked to stop, and the pass answers that failure: the others still get their step', async () => {
    const { children, hand, states, stopped } = await world(() => 'accepted', [2])
    await hand(1)
    await hand(2)
    await hand(3)
    ok(await children.close({ ...parent, reach: 'all', cause: 'stopped' }))
    expect(await children.dispose(parent)).toEqual({
      failure: { kind: 'unavailable', dependency: 'start-guards', diagnostic: 'down' },
    })
    expect(await states()).toEqual([
      [1, 'handed', 'accepted'],
      [2, 'handed'],
      [3, 'handed', 'accepted'],
    ])
    expect(stopped.map(one => one.ordinal)).toEqual([1, 3])
    // What is still owed is exactly the position that was held, so the next pass takes it up again.
    expect(owesDisposal(ok(await children.table(parent))).map(one => one.ordinal)).toEqual([2])
  })

  it('TL-68 excludes the admission of a call that was not accepted, under its own identity, before its position', async () => {
    const { children, hand, store } = await world()
    await hand(1, false)
    ok(await children.close({ ...parent, reach: 'all', cause: 'stopped' }))
    ok(await children.dispose(parent))
    const child = await store.read({ kind: 'call', tenant: tenantA, call: callId('child-1') })
    expect(child.kind === 'complete' && child.records.map(record => record.kind)).toEqual([
      'exclusion',
    ])
  })

  it('TL-69 a withdrawal neither bars nor stops what was in the background at the cut', async () => {
    const { children, hand, states, barred, stopped } = await world()
    await hand(1)
    await hand(2)
    ok(await children.background({ ...parent, ordinal: 2 }))
    ok(await children.close({ ...parent, reach: 'foreground', cause: 'withdrawn' }))
    ok(await children.dispose(parent))
    expect(await states()).toEqual([
      [1, 'handed', 'accepted'],
      [2, 'handed'],
    ])
    expect(barred.map(one => one.ordinal)).toEqual([1])
    expect(stopped.map(one => one.ordinal)).toEqual([1])
    ok(await children.close({ ...parent, reach: 'all', cause: 'stopped' }))
    ok(await children.dispose(parent))
    expect(await states()).toEqual([
      [1, 'handed', 'accepted'],
      [2, 'handed', 'accepted'],
    ])
    expect(stopped.map(one => one.ordinal)).toEqual([1, 2])
  })

  it.each(['accepted', 'refused', 'unknown', 'stopped'] as const)(
    'keeps the answer of the stop (%s) on its own position and asks once',
    async answer => {
      const { children, hand, states, stopped } = await world(() => answer)
      await hand(1)
      ok(await children.close({ ...parent, reach: 'all', cause: 'stopped' }))
      ok(await children.dispose(parent))
      ok(await children.dispose(parent))
      expect(await states()).toEqual([[1, 'handed', answer]])
      expect(stopped).toHaveLength(1)
      ok(await children.retain(retained(1)))
      expect(await states()).toEqual([[1, 'retained']])
    },
  )

  it('does nothing while no barrier stands, and nothing to a table that is only sealed', async () => {
    const { children, hand, states, barred, stopped } = await world()
    await hand(1)
    ok(await children.dispose(parent))
    ok(await children.seal(parent))
    ok(await children.dispose(parent))
    expect(await states()).toEqual([[1, 'handed']])
    expect([barred, stopped]).toEqual([[], []])
  })
})

describe('a closed program that still owes a step is pending work', () => {
  const position = (state: object) =>
    ({ kind: 'position', position: { ...at(1), ...state } }) as never
  const program = (phase: ProgramTable['phase'], reach?: ProgramFence['reach']) =>
    ({
      kind: 'program',
      program: {
        phase,
        ...(reach === undefined
          ? {}
          : { fence: { reach, cause: 'stopped', cut: [{ ordinal: 1, relation: 'background' }] } }),
      },
    }) as never

  it.each([
    ['an open table', [program('open'), position({ state: 'handed', background: false })], false],
    ['a sealed table', [program('sealed'), position({ state: 'registered' })], false],
    [
      'a closed table with a registered position',
      [program('closing', 'all'), position({ state: 'registered' })],
      true,
    ],
    [
      'a closed table with a handed-off position not yet asked to stop',
      [program('closing', 'all'), position({ state: 'handed', background: false })],
      true,
    ],
    [
      'one that was asked',
      [
        program('closing', 'all'),
        position({ state: 'handed', background: false, stop: 'unknown' }),
      ],
      false,
    ],
    [
      'one the barrier does not reach',
      [program('closing', 'foreground'), position({ state: 'handed', background: true })],
      false,
    ],
    [
      'one that was excluded',
      [
        program('closing', 'all'),
        position({ state: 'excluded', exclusion: { kind: 'closed', reason: '' } }),
      ],
      false,
    ],
  ] as const)('%s', (_, records, pending) => {
    expect(hasPendingWork(records)).toBe(pending)
    expect(hasPendingWork([...records].reverse())).toBe(pending)
  })
})

describe('TL-69 a control that takes effect closes the program of the call in the same commit', () => {
  /** A running call with a table: one position in the foreground, one in the background. */
  async function withProgram(): Promise<CallSnapshot> {
    const snapshot = await runningCallSnapshot()
    const handed = (ordinal: number, background: boolean) =>
      [ordinal, { ...at(ordinal), state: 'handed', background }] as const
    return {
      ...snapshot,
      program: { phase: 'open' },
      positions: new Map([handed(1, false), handed(2, true)]),
    } as never
  }
  const fenceOf = (decided: ReturnType<typeof decideStop>) => {
    if (decided.kind !== 'commit') throw new Error(JSON.stringify(decided))
    const written = decided.writes.flatMap(write =>
      write.kind === 'put' && write.record.kind === 'program' ? [write.record.program] : [],
    )
    expect(written.length).toBeLessThanOrEqual(1)
    return written[0]
  }
  const cut = [
    { ordinal: 1, relation: 'foreground' },
    { ordinal: 2, relation: 'background' },
  ]

  it.each([
    [{ kind: 'stop' }, 'all', 'stopped'],
    [{ kind: 'withdraw', reach: 'all' }, 'all', 'withdrawn'],
    [{ kind: 'withdraw', reach: 'foreground-and-unadmitted' }, 'foreground', 'withdrawn'],
  ] as const)('%j closes it with reach %s and cause %s', async (intent, reach, cause) => {
    const decided = decideStop(await withProgram(), intent)
    expect(fenceOf(decided)).toEqual({ phase: 'closing', fence: { reach, cause, cut } })
  })

  it('writes no table for a call that has none, and none again when the barrier already reaches all', async () => {
    expect(fenceOf(decideStop(await runningCallSnapshot()))).toBeUndefined()
    const closed = {
      ...(await withProgram()),
      program: { phase: 'closing', fence: { reach: 'all', cause: 'failed', cut } },
    } as never
    expect(fenceOf(decideStop(closed))).toBeUndefined()
  })

  it('a stop after a withdrawal widens the reach and keeps the cause', async () => {
    const withdrawn = {
      ...(await withProgram()),
      program: { phase: 'closing', fence: { reach: 'foreground', cause: 'withdrawn', cut } },
    } as never
    expect(fenceOf(decideStop(withdrawn))).toEqual({
      phase: 'closing',
      fence: { reach: 'all', cause: 'withdrawn', cut },
    })
  })
})

import { describe, expect, it } from 'vitest'
import type { ToolResultVersion } from '@omne-harness/tool-contract'
import { isProgramSettled, type PositionTarget } from '@omne-harness/tool-contract/provider'
import { createToolPositions, programUnsettled } from '../src/ledger-positions.ts'
import {
  admission,
  callId,
  failure,
  guards,
  harness,
  ok,
  operationId,
  principalA,
  principalB,
  tenantA,
} from './runtime-values.ts'

const parent = { principal: principalA, tenant: tenantA, call: callId('call-1') }
const target = (name: string): PositionTarget => ({
  name,
  command: 'read',
  digest: `sha256:${name}`,
})
const at = (ordinal: number, name = 'Files') => ({
  ...parent,
  ordinal,
  child: callId(`child-${String(ordinal)}`),
  admission: operationId(`child-op-${String(ordinal)}`),
  target: target(name),
})
const result = (text: string) => text as ToolResultVersion
const retained = (ordinal: number, version = 'result-1') => ({
  ...parent,
  ordinal,
  result: result(version),
  terminal: { kind: 'completed' } as const,
  effect: { kind: 'not-started' } as const,
})
const denied = { kind: 'denied', reason: 'the gate said no' } as const

async function world() {
  const assembly = harness()
  ok(await assembly.ledger.admissions.admit(admission('call-1', 'op-1')))
  const children = createToolPositions({
    store: assembly.store,
    access: guards().access,
    commitAttempts: 8,
    lookup: assembly.ledger.reads.lookup,
  })
  return { ...assembly, children }
}

describe('the position table of a program (TL-65 to TL-68)', () => {
  it('registers a position once: the same position gives the same record, another target conflicts', async () => {
    const { children, store } = await world()
    const first = ok(await children.register(at(1)))
    expect(first).toEqual({
      ...at(1),
      principal: undefined,
      tenant: undefined,
      call: undefined,
      state: 'registered',
    })
    const commits = store.commits
    expect(ok(await children.register(at(1)))).toEqual(first)
    expect(store.commits).toBe(commits)
    expect(failure(await children.register(at(1, 'Web')))).toMatchObject({ kind: 'conflict' })
    expect(failure(await children.register({ ...at(1), child: callId('other') }))).toMatchObject({
      kind: 'conflict',
    })
    expect(ok(await children.table(parent))).toEqual({ phase: 'open', positions: [first] })
  })

  it('lists positions by ordinal, whatever the order they were registered in', async () => {
    const { children } = await world()
    for (const ordinal of [10, 2, 0]) ok(await children.register(at(ordinal)))
    expect(ok(await children.table(parent)).positions.map(one => one.ordinal)).toEqual([0, 2, 10])
  })

  it('walks one position from registered to handed off to retained, and keeps each step idempotent', async () => {
    const { children } = await world()
    ok(await children.register(at(1)))
    const handed = ok(await children.handOff({ ...parent, ordinal: 1 }))
    expect(handed).toMatchObject({ state: 'handed', background: false })
    expect(ok(await children.handOff({ ...parent, ordinal: 1 }))).toEqual(handed)
    const kept = ok(await children.retain(retained(1)))
    expect(kept).toMatchObject({
      state: 'retained',
      result: 'result-1',
      terminal: { kind: 'completed' },
      late: false,
    })
    expect(kept).not.toHaveProperty('background')
    expect(ok(await children.retain(retained(1)))).toEqual(kept)
    expect(ok(await children.handOff({ ...parent, ordinal: 1 }))).toEqual(kept)
    expect(ok(await children.retain(retained(1, 'result-2')))).toMatchObject({
      result: 'result-2',
      late: true,
    })
  })

  it('retains nothing that was not handed off', async () => {
    const { children } = await world()
    ok(await children.register(at(1)))
    expect(failure(await children.retain(retained(1)))).toMatchObject({ kind: 'conflict' })
    ok(await children.exclude({ ...parent, ordinal: 1, exclusion: denied }))
    expect(failure(await children.retain(retained(1)))).toMatchObject({ kind: 'conflict' })
    expect(failure(await children.retain(retained(7)))).toMatchObject({
      field: 'position',
      reason: 'unknown-position',
    })
  })

  it('excludes a registered position, keeps the first reason, and hands nothing off after it', async () => {
    const { children } = await world()
    ok(await children.register(at(1)))
    const excluded = ok(await children.exclude({ ...parent, ordinal: 1, exclusion: denied }))
    expect(excluded).toMatchObject({ state: 'excluded', exclusion: denied })
    const again = { kind: 'unavailable', reason: 'later' } as const
    expect(ok(await children.exclude({ ...parent, ordinal: 1, exclusion: again }))).toEqual(
      excluded,
    )
    expect(failure(await children.handOff({ ...parent, ordinal: 1 }))).toMatchObject({
      field: 'position',
      reason: 'excluded',
    })
  })

  it('TL-68: excludes a handed-off position only once its admission is excluded under its own identity', async () => {
    const { children, ledger, store } = await world()
    ok(await children.register(at(1)))
    ok(await children.handOff({ ...parent, ordinal: 1 }))
    const unaccepted = { kind: 'not-accepted', reason: 'never accepted' } as const
    const excluded = ok(await children.exclude({ ...parent, ordinal: 1, exclusion: unaccepted }))
    expect(excluded).toMatchObject({ state: 'excluded', exclusion: unaccepted })
    const child = await store.read({ kind: 'call', tenant: tenantA, call: callId('child-1') })
    expect(child.kind === 'complete' && child.records.map(record => record.kind)).toEqual([
      'exclusion',
    ])
    ok(await children.register(at(2)))
    ok(await children.handOff({ ...parent, ordinal: 2 }))
    ok(await ledger.admissions.admit(admission('child-2', 'child-op-2')))
    expect(
      failure(await children.exclude({ ...parent, ordinal: 2, exclusion: unaccepted })),
    ).toMatchObject({
      field: 'position',
      reason: 'handed-off',
    })
    expect(ok(await children.table(parent)).positions[1]).toMatchObject({ state: 'handed' })
  })

  it('marks a handed-off position as in the background, and nothing else', async () => {
    const { children } = await world()
    ok(await children.register(at(1)))
    expect(ok(await children.background({ ...parent, ordinal: 1 }))).toMatchObject({
      state: 'registered',
    })
    ok(await children.handOff({ ...parent, ordinal: 1 }))
    const moved = ok(await children.background({ ...parent, ordinal: 1 }))
    expect(moved).toMatchObject({ state: 'handed', background: true })
    expect(ok(await children.background({ ...parent, ordinal: 1 }))).toEqual(moved)
    ok(await children.retain(retained(1)))
    expect(ok(await children.background({ ...parent, ordinal: 1 }))).toMatchObject({
      state: 'retained',
    })
  })

  it('TL-66: registers nothing after the table is sealed, and still walks what was registered', async () => {
    const { children } = await world()
    ok(await children.register(at(1)))
    ok(await children.register(at(2)))
    const sealed = ok(await children.seal(parent))
    expect(sealed.phase).toBe('sealed')
    expect(ok(await children.seal(parent))).toEqual(sealed)
    expect(failure(await children.register(at(3)))).toMatchObject({
      field: 'position',
      reason: 'table-sealed',
    })
    expect(ok(await children.register(at(1)))).toMatchObject({ state: 'registered' })
    ok(await children.handOff({ ...parent, ordinal: 1 }))
    ok(await children.retain(retained(1)))
    ok(await children.exclude({ ...parent, ordinal: 2, exclusion: denied }))
    expect(ok(await children.table(parent)).positions.map(one => one.state)).toEqual([
      'retained',
      'excluded',
    ])
  })

  it('TL-67: a table is settled only when it is sealed and every position is excluded or retained', async () => {
    const { children } = await world()
    expect(isProgramSettled(ok(await children.table(parent)))).toBe(false)
    ok(await children.register(at(1)))
    ok(await children.register(at(2)))
    ok(await children.handOff({ ...parent, ordinal: 1 }))
    expect(isProgramSettled(ok(await children.seal(parent)))).toBe(false)
    ok(await children.retain(retained(1)))
    expect(isProgramSettled(ok(await children.table(parent)))).toBe(false)
    ok(await children.exclude({ ...parent, ordinal: 2, exclusion: denied }))
    expect(isProgramSettled(ok(await children.table(parent)))).toBe(true)
    const empty = await world()
    expect(isProgramSettled(ok(await empty.children.seal(parent)))).toBe(true)
  })

  it('refuses an ordinal that is not a whole number, a call that does not exist, and another principal', async () => {
    const { children } = await world()
    for (const ordinal of [-1, 1.5, Number.NaN])
      expect(failure(await children.register({ ...at(1), ordinal }))).toMatchObject({
        field: 'ordinal',
      })
    const nowhere = { ...at(1), call: callId('call-9') }
    expect(failure(await children.register(nowhere))).toMatchObject({ reason: 'unknown-call' })
    expect(failure(await children.seal({ ...parent, call: callId('call-9') }))).toMatchObject({
      reason: 'unknown-call',
    })
    expect(failure(await children.register({ ...at(1), principal: principalB }))).toMatchObject({
      kind: 'denied',
    })
    expect(failure(await children.table({ ...parent, principal: principalB }))).toMatchObject({
      kind: 'denied',
    })
  })
})

describe('the position table, cell by cell', () => {
  const table = { kind: 'call', tenant: tenantA, call: callId('call-1') } as const
  const kinds = async (store: Awaited<ReturnType<typeof world>>['store']) => {
    const read = await store.read(table)
    return read.kind === 'complete' ? read.records.map(record => record.kind).sort() : []
  }

  it('a position is the same only when its child, its admission and every part of its target are', async () => {
    const { children } = await world()
    ok(await children.register(at(1)))
    const other = (changed: Partial<PositionTarget>) => ({
      ...at(1),
      target: { ...target('Files'), ...changed },
    })
    for (const changed of [
      other({ name: 'Web' }),
      other({ command: 'write' }),
      other({ digest: 'sha256:other' }),
      { ...at(1), admission: operationId('another-op') },
    ])
      expect(failure(await children.register(changed))).toEqual({
        kind: 'conflict',
        operation: operationId('child-op-1'),
      })
  })

  it('the first position opens the table in the same commit; an empty table reads as open and writes nothing', async () => {
    const { children, store } = await world()
    expect(ok(await children.table(parent))).toEqual({ phase: 'open', positions: [] })
    expect(await kinds(store)).not.toContain('program')
    const commits = store.commits
    ok(await children.register(at(1)))
    expect(store.commits).toBe(commits + 1)
    expect(await kinds(store)).toEqual(expect.arrayContaining(['position', 'program']))
    const read = await store.read(table)
    const opened = read.kind === 'complete' && read.records.find(one => one.kind === 'program')
    expect(opened).toEqual({ kind: 'program', program: { phase: 'open' } })
    ok(await children.register(at(2)))
    expect((await kinds(store)).filter(kind => kind === 'program')).toHaveLength(1)
    expect(store.commits).toBe(commits + 2)
  })

  it('sealing writes once, and a sealed table that is sealed again is read, not written', async () => {
    const { children, store } = await world()
    const before = store.commits
    const sealed = ok(await children.seal(parent))
    expect(sealed).toEqual({ phase: 'sealed', positions: [] })
    expect(store.commits).toBe(before + 1)
    expect(ok(await children.seal(parent))).toEqual(sealed)
    expect(store.commits).toBe(before + 1)
    expect(ok(await children.table(parent)).phase).toBe('sealed')
  })

  it('every step on a position the table does not have, or on a call that does not exist, is refused by name', async () => {
    const { children } = await world()
    const nine = { ...parent, ordinal: 9 }
    const nowhere = { ...parent, call: callId('call-9'), ordinal: 1 }
    const steps = [
      (given: typeof nine) => children.exclude({ ...given, exclusion: denied }),
      (given: typeof nine) => children.handOff(given),
      (given: typeof nine) => children.background(given),
      (given: typeof nine) => children.retain({ ...retained(1), ...given }),
    ]
    for (const step of steps) {
      expect(failure(await step(nine))).toEqual({
        kind: 'invalid',
        field: 'position',
        reason: 'unknown-position',
      })
      expect(failure(await step(nowhere))).toEqual({
        kind: 'invalid',
        field: 'call',
        reason: 'unknown-call',
      })
      expect(failure(await step({ ...nine, ordinal: 1.5 }))).toMatchObject({
        field: 'ordinal',
        reason: 'whole-number',
      })
    }
  })

  it('the background mark changes a handed-off position only, and writes only then', async () => {
    const { children, store } = await world()
    ok(await children.register(at(1)))
    ok(await children.register(at(2)))
    ok(await children.exclude({ ...parent, ordinal: 2, exclusion: denied }))
    const before = store.commits
    expect(ok(await children.background({ ...parent, ordinal: 1 }))).toEqual({
      ...ok(await children.register(at(1))),
    })
    expect(ok(await children.background({ ...parent, ordinal: 2 })).state).toBe('excluded')
    expect(store.commits).toBe(before)
    ok(await children.handOff({ ...parent, ordinal: 1 }))
    ok(await children.background({ ...parent, ordinal: 1 }))
    ok(await children.background({ ...parent, ordinal: 1 }))
    expect(store.commits).toBe(before + 2)
  })

  it('asks the guard for write on every change and for lookup on a read, with the principal that asked', async () => {
    const assembly = harness()
    ok(await assembly.ledger.admissions.admit(admission('call-1', 'op-1')))
    const asked: string[] = []
    const children = createToolPositions<typeof principalA>({
      store: assembly.store,
      access: {
        qualify: async input => {
          asked.push(`${input.action}:${input.principal.subject}`)
          return input.principal === principalA
            ? { kind: 'allowed' }
            : { kind: 'denied', reason: 'not yours' }
        },
      },
      commitAttempts: 8,
      lookup: assembly.ledger.reads.lookup,
    })
    ok(await children.register(at(1)))
    ok(await children.handOff({ ...parent, ordinal: 1 }))
    ok(await children.background({ ...parent, ordinal: 1 }))
    ok(await children.retain(retained(1)))
    ok(await children.seal(parent))
    ok(await children.table(parent))
    expect(asked).toEqual([
      'write:alice',
      'write:alice',
      'write:alice',
      'write:alice',
      'write:alice',
      'lookup:alice',
    ])
    const foreign = { ...parent, principal: principalB, ordinal: 1 }
    for (const refused of [
      await children.exclude({ ...foreign, exclusion: denied }),
      await children.handOff(foreign),
      await children.retain({ ...retained(1), principal: principalB }),
      await children.seal(foreign),
    ])
      expect(failure(refused)).toMatchObject({ kind: 'denied' })
  })

  it('TL-68: only a handed-off position is looked up under the identity of its child, and a lookup that fails excludes nothing', async () => {
    const assembly = harness()
    ok(await assembly.ledger.admissions.admit(admission('call-1', 'op-1')))
    const looked: unknown[] = []
    let answer: 'not-accepted' | 'found' | 'down' = 'not-accepted'
    const children = createToolPositions<typeof principalA>({
      store: assembly.store,
      access: guards().access,
      commitAttempts: 8,
      lookup: async input => {
        looked.push([input.call, input.admission])
        return answer === 'down'
          ? { failure: { kind: 'unavailable', dependency: 'ledger-store', diagnostic: 'down' } }
          : { ok: { kind: answer } }
      },
    })
    const unaccepted = { kind: 'not-accepted', reason: 'never' } as const
    ok(await children.register(at(1)))
    ok(await children.exclude({ ...parent, ordinal: 1, exclusion: unaccepted }))
    expect(looked).toEqual([])
    for (const ordinal of [2, 3, 4]) {
      ok(await children.register(at(ordinal)))
      ok(await children.handOff({ ...parent, ordinal }))
    }
    answer = 'down'
    expect(
      failure(await children.exclude({ ...parent, ordinal: 2, exclusion: unaccepted })),
    ).toEqual({ kind: 'unavailable', dependency: 'ledger-store', diagnostic: 'down' })
    answer = 'found'
    expect(
      failure(await children.exclude({ ...parent, ordinal: 3, exclusion: unaccepted })),
    ).toMatchObject({ reason: 'handed-off' })
    answer = 'not-accepted'
    expect(ok(await children.exclude({ ...parent, ordinal: 4, exclusion: unaccepted })).state).toBe(
      'excluded',
    )
    expect(looked).toEqual([
      [callId('child-2'), operationId('child-op-2')],
      [callId('child-3'), operationId('child-op-3')],
      [callId('child-4'), operationId('child-op-4')],
    ])
    expect(ok(await children.table(parent)).positions.map(one => one.state)).toEqual([
      'excluded',
      'handed',
      'handed',
      'excluded',
    ])
  })

  it('a commit whose outcome is not known is reported as unavailable and asks to be repeated', async () => {
    const assembly = harness()
    ok(await assembly.ledger.admissions.admit(admission('call-1', 'op-1')))
    let lose = false
    const children = createToolPositions<typeof principalA>({
      store: {
        read: assembly.store.read,
        commit: async input =>
          lose ? { kind: 'unknown', diagnostic: 'reply lost' } : assembly.store.commit(input),
      },
      access: guards().access,
      commitAttempts: 8,
      lookup: assembly.ledger.reads.lookup,
    })
    lose = true
    expect(failure(await children.register(at(1)))).toEqual({
      kind: 'unavailable',
      dependency: 'ledger-store',
      diagnostic: 'the outcome of the position commit is unknown; repeat it',
    })
    lose = false
    expect(ok(await children.register(at(1))).state).toBe('registered')
  })

  it('TL-67: a call has unsettled positions from its first position until the sealed table has none open', () => {
    const snapshot = (phase: 'open' | 'sealed' | null, states: readonly string[]) =>
      ({
        program: phase === null ? null : { phase },
        positions: new Map(
          states.map((state, index) => [index + 1, { ordinal: index + 1, state }]),
        ),
      }) as unknown as Parameters<typeof programUnsettled>[0]
    expect(programUnsettled(snapshot(null, []))).toBe(false)
    expect(programUnsettled(snapshot('open', []))).toBe(true)
    expect(programUnsettled(snapshot(null, ['registered']))).toBe(true)
    expect(programUnsettled(snapshot('sealed', []))).toBe(false)
    expect(programUnsettled(snapshot('sealed', ['retained', 'excluded']))).toBe(false)
    expect(programUnsettled(snapshot('sealed', ['retained', 'handed']))).toBe(true)
    expect(programUnsettled(snapshot('open', ['retained']))).toBe(true)
  })
})

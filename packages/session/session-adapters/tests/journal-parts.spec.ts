// The parts of a session's durable Agent records (K-8, `src/cordis/journal-parts.ts`): every record
// lives in the part of its execution; a publication writes the parts whose records changed, were
// added or went, and the writer's own parts; the stored parts rebuild the same state, maps in the
// same order. The storage is a map from part name to part, as `er_state_part` keeps them.
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/sql-contract'
import {
  mergeParts,
  operationsPart,
  planParts,
  rebuildParts,
  recordsPart,
  SESSION_PART,
  type PartLayout,
} from '../src/cordis/journal-parts.ts'
import { encodeState, type DurableJournalState } from '../src/cordis/journal-state.ts'
import { semanticKey } from '../src/testing/journal-values.ts'

type Mutable = {
  -readonly [K in keyof DurableJournalState]: DurableJournalState[K]
}

/** A copy of `state` whose maps are new and whose records are the same: the Journal core's draft. */
function draft(state: DurableJournalState): Mutable {
  const maps = Object.fromEntries(
    Object.entries(state).map(([name, member]: [string, unknown]) => [
      name,
      member instanceof Map
        ? new Map(member as Map<unknown, unknown>)
        : Array.isArray(member)
          ? [...member]
          : Object.fromEntries(
              Object.entries(member as object).map(([inner, map]) => [
                inner,
                new Map(map as Map<unknown, unknown>),
              ]),
            ),
    ]),
  )
  return maps as unknown as Mutable
}

const operationKey = (execution: string, operation: string) =>
  JSON.stringify(['tenant', execution, operation])

/** The stored parts, the layout that mirrors them and the state they hold, as a provider keeps them. */
function store() {
  const parts = new Map<string, JsonValue>()
  let rebuilt = rebuildParts([])
  let layout: PartLayout = rebuilt.layout
  let stored: DurableJournalState = rebuilt.state
  return {
    parts,
    get stored() {
      return stored
    },
    /** One publication of `next` by `writer`: the names it wrote. */
    publish(next: DurableJournalState, writer: string | null): string[] {
      const plan = planParts(layout, stored, next, writer)
      for (const { part, state } of plan.parts)
        if (state === null) parts.delete(part)
        else parts.set(part, state)
      plan.commit()
      stored = next
      return plan.parts.map(item => item.part)
    },
    /** A new copy from the stored parts, in the order the storage reads them. */
    rebuild(): DurableJournalState {
      rebuilt = rebuildParts(
        [...parts].sort(([a], [b]) => (a < b ? -1 : 1)).map(([part, state]) => ({ part, state })),
      )
      layout = rebuilt.layout
      stored = rebuilt.state
      return rebuilt.state
    },
  }
}

/** The encoded form of every member, with the order of its keys. */
const form = (state: DurableJournalState) => encodeState(state)

function twoExecutions(): Mutable {
  const state = draft(rebuildParts([]).state)
  state.executions.set('k-a', { id: 'exe_a', revision: 1 } as never)
  state.executions.set('k-b', { id: 'exe_b', revision: 1 } as never)
  state.operations.set(operationKey('exe_a', 'op-1'), {
    kind: 'committed',
    key: 'open:sha256:1',
  } as never)
  state.operations.set(operationKey('exe_b', 'op-1'), {
    kind: 'committed',
    key: 'open:sha256:2',
  } as never)
  state.eventReceipts.set('exe_a\u00001', { receipt: 'a1' } as never)
  state.notes.consequences.set(JSON.stringify(['exe_b', '1']), [])
  // A record that names no execution: it goes to the writer's part, or the session part.
  state.receiving.materials.set('material-1', { content: 'm' } as never)
  return state
}

describe('the first publication', () => {
  it('puts each record in the part of its execution and rebuilds the same state', () => {
    const s = store()
    const state = twoExecutions()
    expect(s.publish(state, null).sort()).toEqual(
      [
        operationsPart('exe_a'),
        operationsPart('exe_b'),
        recordsPart('exe_a'),
        recordsPart('exe_b'),
        SESSION_PART,
      ].sort(),
    )
    expect(Object.keys(s.parts.get(recordsPart('exe_a')) as object).sort()).toEqual([
      'eventReceipts',
      'executions',
    ])
    expect(Object.keys(s.parts.get(SESSION_PART) as object)).toEqual(['receiving.materials'])
    expect(form(s.rebuild())).toEqual(form(state))
  })

  it('a record that names no execution goes to the part of the writing execution', () => {
    const s = store()
    s.publish(twoExecutions(), 'exe_a')
    expect(s.parts.has(SESSION_PART)).toBe(false)
    expect(Object.keys(s.parts.get(recordsPart('exe_a')) as object)).toContain(
      'receiving.materials',
    )
  })
})

describe('a later publication', () => {
  it('writes the part of a record that changed, and no part whose records stayed', () => {
    const s = store()
    s.publish(twoExecutions(), null)
    s.rebuild()
    const next = draft(s.stored)
    next.executions.set('k-a', { id: 'exe_a', revision: 2 } as never)
    expect(s.publish(next, null)).toEqual([recordsPart('exe_a')])
    expect(form(s.rebuild())).toEqual(form(next))
  })

  it('writes the writer’s own parts, whatever changed', () => {
    const s = store()
    s.publish(twoExecutions(), null)
    const next = draft(s.stored)
    next.executions.set('k-b', { id: 'exe_b', revision: 2 } as never)
    expect(s.publish(next, 'exe_a').sort()).toEqual(
      [operationsPart('exe_a'), recordsPart('exe_a'), recordsPart('exe_b')].sort(),
    )
  })

  it('a record that goes leaves its part; the last one drops the part', () => {
    const s = store()
    s.publish(twoExecutions(), null)
    const next = draft(s.stored)
    next.operations.delete(operationKey('exe_b', 'op-1'))
    next.receiving.materials.delete('material-1')
    const written = s.publish(next, null)
    expect(written.sort()).toEqual([operationsPart('exe_b'), SESSION_PART].sort())
    expect(s.parts.has(operationsPart('exe_b'))).toBe(false)
    expect(s.parts.has(SESSION_PART)).toBe(false)
    expect(form(s.rebuild())).toEqual(form(next))
  })

  it('a record deleted and set again moves to the end of its map, in the rebuilt copy too', () => {
    const s = store()
    s.publish(twoExecutions(), null)
    s.rebuild()
    const next = draft(s.stored)
    const first = next.executions.get('k-a')!
    next.executions.delete('k-a')
    next.executions.set('k-a', first)
    s.publish(next, null)
    expect([...s.rebuild().executions.keys()]).toEqual(['k-b', 'k-a'])
    expect(form(s.stored)).toEqual(form(next))
  })

  it('a hundred publications of one execution after many others write its parts only', () => {
    const s = store()
    let state: DurableJournalState = twoExecutions()
    s.publish(state, null)
    for (let n = 0; n < 100; n += 1) {
      const next = draft(state)
      next.executions.set(`k-${n}`, { id: `exe_${n}`, revision: 1 } as never)
      next.operations.set(operationKey(`exe_${n}`, 'op-1'), {
        kind: 'committed',
        key: `k${n}`,
      } as never)
      expect(s.publish(next, `exe_${n}`).sort()).toEqual(
        [operationsPart(`exe_${n}`), recordsPart(`exe_${n}`)].sort(),
      )
      state = next
    }
    expect(form(s.rebuild())).toEqual(form(state))
  })
})

describe('a copy that another provider made stale', () => {
  it('merging the parts written since gives the state a full rebuild gives, in the same order', () => {
    const writer = store()
    writer.publish(twoExecutions(), null)
    // The reader's copy at this count: its state and layout, as a rebuild gave them.
    const base = rebuildParts([...writer.parts].map(([part, state]) => ({ part, state })))
    // The writer goes on: one record of exe_a changes, one of exe_b goes, a new execution comes.
    const next = draft(writer.stored)
    next.executions.set('k-a', { id: 'exe_a', revision: 2 } as never)
    next.operations.delete(operationKey('exe_b', 'op-1'))
    next.executions.set('k-c', { id: 'exe_c', revision: 1 } as never)
    const before = new Map(writer.parts)
    const written = writer.publish(next, null)
    const changed = written.map(part => ({ part, state: writer.parts.get(part) ?? null }))
    expect(changed.map(item => item.part).sort()).toEqual(
      [operationsPart('exe_b'), recordsPart('exe_a'), recordsPart('exe_c')].sort(),
    )
    expect(before.has(recordsPart('exe_c'))).toBe(false)
    const merged = mergeParts(base, changed)
    expect(form(merged.state)).toEqual(form(next))
    expect([...merged.state.executions.keys()]).toEqual(['k-a', 'k-b', 'k-c'])
    // The merged layout goes on as the writer's does: the next plan writes the same parts.
    const after = draft(merged.state)
    after.executions.set('k-c', { id: 'exe_c', revision: 2 } as never)
    expect(planParts(merged.layout, merged.state, after, null).parts.map(p => p.part)).toEqual([
      recordsPart('exe_c'),
    ])
  })
})

describe('a part this provider did not write', () => {
  it('a member it does not know, or one record in two parts, does not rebuild', () => {
    expect(() => rebuildParts([{ part: 'x:e', state: { unknown: [] } }])).toThrow(TypeError)
    const entry = [[0, 'k', { id: 'e' }]]
    expect(() =>
      rebuildParts([
        { part: 'x:e', state: { executions: entry } },
        { part: 'x:f', state: { executions: entry } },
      ]),
    ).toThrow('in two parts')
    expect(() => rebuildParts([{ part: 'x:e', state: { executions: [['k', 'v']] } }])).toThrow(
      'malformed',
    )
  })
})

describe('the semantic key an operation record keeps', () => {
  it('has the same length whatever the input, and tells inputs apart as their text does', () => {
    const small = { operation: 'op', checkpoint: { position: 'E1' } }
    const large = { operation: 'op', checkpoint: { position: 'E1', history: 'h'.repeat(10_000) } }
    expect(semanticKey('commit', large)).toHaveLength(semanticKey('commit', small).length)
    expect(semanticKey('commit', small)).toBe(semanticKey('commit', { ...small }))
    expect(semanticKey('commit', small)).not.toBe(semanticKey('commit', large))
    expect(semanticKey('commit', small)).not.toBe(semanticKey('submit', small))
    // The Access members are not part of the key; the method stays readable before the colon.
    expect(semanticKey('commit', { ...small, principal: 'p', tenant: 't' })).toBe(
      semanticKey('commit', small),
    )
    expect(semanticKey('received', small).split(':')[0]).toBe('received')
  })
})

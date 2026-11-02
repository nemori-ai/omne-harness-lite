// CX-14 at the operation group: a call that is lent reuse reads only the rows after the cached
// ones, projects only the appended rows, and derives the same candidate as a call without reuse.
// The reuse here is a one-slot double of the seam; the registry that owns the real state is tested
// in the request-context member.
import { describe, expect, it } from 'vitest'
import { judgeBlockIdentity } from '@omne-harness/content-block'
import { judgeMessage, type Message } from '@omne-harness/message'
import {
  createAssemblyOperations,
  project,
  type AssemblyReuse,
  type AssemblyResult,
  type CachedAssemblyMaterial,
  type HistoryRow,
} from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  createTestingPrincipalBinding,
  type AssemblyFixture,
} from '@omne-harness/request-context-contract/testing'
import {
  callId,
  entry,
  epoch,
  evidence,
  row,
  rowWith,
  seq,
  tenant,
  text,
  upper,
} from './fixtures.js'

function candidateOf(result: AssemblyResult) {
  if (result.kind !== 'candidate-before-extension' && result.kind !== 'candidate-fixable')
    throw new Error(`expected a candidate, got ${JSON.stringify(result)}`)
  return result.candidate
}

/** A one-slot double of the seam: what a call stages becomes visible to the next call. */
function oneSlot() {
  let slot: CachedAssemblyMaterial | null = null
  const staged: CachedAssemblyMaterial[] = []
  const loads: unknown[] = []
  const reuse: AssemblyReuse = {
    load(input) {
      loads.push(input)
      return slot
    },
    stage(material) {
      staged.push(material)
    },
  }
  return {
    reuse,
    staged,
    loads,
    /** Publishes what the last call staged, as the registry does after its publication check. */
    commit() {
      slot = staged.at(-1) ?? slot
    },
    put(material: CachedAssemblyMaterial | null) {
      slot = material
    },
  }
}

function operationsOf(f: AssemblyFixture, reuse?: AssemblyReuse) {
  return createAssemblyOperations({
    target: f.target,
    sources: f.sources,
    principalBinding: createTestingPrincipalBinding<string>(),
    policies: f.policies,
    generation: null,
    ...(reuse === undefined ? {} : { reuse }),
  })
}
/** Counts what the history port really returns. */
function counted(f: AssemblyFixture) {
  const counts = { pages: 0, rows: 0 }
  const reader = f.history as unknown as { read: AssemblyFixture['history']['read'] }
  const original = reader.read.bind(f.history)
  reader.read = async input => {
    counts.pages++
    const result = await original(input)
    if (result.kind === 'page') counts.rows += result.page.rows.length
    return result
  }
  return { counts, original }
}
type Eligibility = { set(decision: 'allowed' | { kind: 'denied' }): void }
const eligibilityOf = (f: AssemblyFixture) => f.sources.eligibility as unknown as Eligibility
/** The history group says the history ends at `index`; the double serves rows up to it. */
function growTo(f: AssemblyFixture, index: number) {
  const history = f.sources.values().history
  f.sources.update('history', {
    ...history,
    evidence: { ...history.evidence, upper: upper(index) },
  })
}

function assistantRow(index: number): HistoryRow {
  const state = judgeBlockIdentity({
    id: `state${index}`,
    visibility: { toModel: true, toHuman: false },
  })
  if ('rejected' in state) throw new Error('fixture')
  const message = judgeMessage({
    role: 'assistant',
    id: row(index).message.id,
    blocks: [
      { ...text('private', `private${index}`), visibility: { toModel: false, toHuman: true } },
      text('public', `public${index}`),
      {
        kind: 'reasoning_state',
        ...state.ok,
        payload: 'opaque-state',
        pairs: [`private${index}`, `public${index}`],
      },
    ],
    replay: { scope: 's', format: 'f', at: [2] },
  })
  if ('rejected' in message) throw new Error(message.rejected)
  return rowWith(index, message.ok, { tenant, call: callId(`call${index}`) })
}
function compactionRow(index: number, covers: HistoryRow): HistoryRow {
  const message: Message = {
    role: 'compaction',
    id: row(index).message.id,
    blocks: [text('summary', `summary${index}`)],
    covers: { from: covers.entry, to: covers.entry },
    retained: [],
    derivation: evidence,
  }
  return rowWith(index, message)
}
const mixed = (): HistoryRow[] => [
  row(0),
  assistantRow(1),
  row(2),
  assistantRow(3),
  row(4),
  row(5),
  row(6),
]

describe('an appended projection equals the full projection', () => {
  it('CX-14 gives the same candidate content for every growth step, with replay and source call', async () => {
    const rows = mixed()
    const f = createAssemblyFixture({ rows })
    const slot = oneSlot()
    const hot = operationsOf(f, slot.reuse)
    growTo(f, 1)
    for (const index of [1, 2, 3, 4, 6]) {
      growTo(f, index)
      const warm = candidateOf(await hot.assemble(f.call))
      slot.commit()
      const cold = candidateOf(await operationsOf(f).assemble(f.call))
      // The source chains the prefix digests, so the full projection runs over the rows it returned.
      expect(warm.preparation.view).toEqual(project(cold.preparation.rows, epoch))
      expect(warm.preparation.view).toEqual(cold.preparation.view)
      expect(warm.layers.historyHead).toEqual(cold.layers.historyHead)
      expect(warm.layers.historyBody).toEqual(cold.layers.historyBody)
      expect(warm.layers.snapshotReminder).toEqual(cold.layers.snapshotReminder)
      expect(warm.assembled).toEqual(cold.assembled)
      expect(warm.coverage).toEqual(cold.coverage)
    }
    const view = candidateOf(await hot.assemble(f.call)).preparation.view
    const assistant = view.messages.find(m => m.seq === seq(3))
    expect(assistant?.sourceCall).toEqual({ tenant, call: callId('call3') })
    expect(assistant?.message).toMatchObject({ role: 'assistant', replay: { at: [1] } })
  })

  it('CX-14 projects again after a compaction record among the added rows', async () => {
    const rows = [row(0), row(1), row(2), compactionRow(3, row(0)), row(4), row(5)]
    const f = createAssemblyFixture({ rows })
    const slot = oneSlot()
    const hot = operationsOf(f, slot.reuse)
    growTo(f, 2)
    await hot.assemble(f.call)
    slot.commit()
    growTo(f, 5)
    const warm = candidateOf(await hot.assemble(f.call))
    const cold = candidateOf(await operationsOf(f).assemble(f.call))
    expect(warm.preparation.view).toEqual(project(cold.preparation.rows, epoch))
    expect(warm.preparation.view.compaction).not.toBeNull()
    expect(warm.layers.historyHead).toEqual(cold.layers.historyHead)
    expect(warm.layers.historyBody).toEqual(cold.layers.historyBody)
  })
})

describe('the layered history is extended, not derived again', () => {
  it('CX-14 keeps the head of an unchanged anchor and classifies only the appended messages', async () => {
    const f = createAssemblyFixture({ rows: mixed() })
    const slot = oneSlot()
    const hot = operationsOf(f, slot.reuse)
    growTo(f, 2)
    candidateOf(await hot.assemble(f.call))
    slot.commit()
    // The appended rows are the new inputs of this request, so the anchor stays at the old tail.
    const history = f.sources.values().history
    f.sources.update('history', {
      ...history,
      evidence: { ...history.evidence, upper: upper(4) },
      inputs: { ...history.inputs, entries: [entry('entry:3'), entry('entry:4')] },
    })
    const warm = candidateOf(await hot.assemble(f.call))
    const [first, second] = slot.staged
    expect(second?.split.head).toBe(first?.split.head)
    expect(second?.split.body.map(m => m.seq)).toEqual([seq(3), seq(4)])
    const cold = candidateOf(await operationsOf(f).assemble(f.call))
    expect(warm.layers.historyHead).toEqual(cold.layers.historyHead)
    expect(warm.layers.historyBody).toEqual(cold.layers.historyBody)
  })

  it('CX-14 moves the anchor forward over the appended messages and splits again after a backward move', async () => {
    const f = createAssemblyFixture({ rows: mixed() })
    const slot = oneSlot()
    const hot = operationsOf(f, slot.reuse)
    growTo(f, 4)
    candidateOf(await hot.assemble(f.call))
    slot.commit()
    growTo(f, 6)
    const forward = candidateOf(await hot.assemble(f.call))
    slot.commit()
    expect(forward.layers.historyBody).toEqual([])
    expect(forward.layers.historyHead).toHaveLength(7)
    // The new inputs now reach back before the cached anchor.
    const history = f.sources.values().history
    f.sources.update('history', {
      ...history,
      inputs: { ...history.inputs, entries: [entry('entry:5'), entry('entry:6')] },
    })
    const back = candidateOf(await hot.assemble(f.call))
    const cold = candidateOf(await operationsOf(f).assemble(f.call))
    expect(back.layers.historyHead).toEqual(cold.layers.historyHead)
    expect(back.layers.historyBody).toEqual(cold.layers.historyBody)
    expect(back.layers.historyHead).toHaveLength(5)
  })
})

describe('the history read continues from the cached rows', () => {
  it('CX-14 reads no page for the same evidence and only the tail for a later one', async () => {
    const f = createAssemblyFixture({ rows: mixed() })
    const { counts } = counted(f)
    const slot = oneSlot()
    const hot = operationsOf(f, slot.reuse)
    growTo(f, 2)
    candidateOf(await hot.assemble(f.call))
    slot.commit()
    expect(counts).toEqual({ pages: 1, rows: 3 })
    candidateOf(await hot.assemble(f.call))
    expect(counts).toEqual({ pages: 1, rows: 3 })
    growTo(f, 4)
    candidateOf(await hot.assemble(f.call))
    expect(counts).toEqual({ pages: 2, rows: 5 })
  })

  it('CX-14 rejects a gapped tail', async () => {
    const f = createAssemblyFixture({ rows: mixed() })
    const slot = oneSlot()
    const hot = operationsOf(f, slot.reuse)
    growTo(f, 2)
    candidateOf(await hot.assemble(f.call))
    slot.commit()
    const reader = f.history as unknown as { read: AssemblyFixture['history']['read'] }
    const original = reader.read.bind(f.history)
    // The page starts after the row that the cursor named, with one row missing in between.
    reader.read = async input => {
      const result = await original(input)
      return result.kind === 'page'
        ? { kind: 'page', page: { rows: result.page.rows.slice(1), next: null } }
        : result
    }
    growTo(f, 4)
    const before = slot.staged.length
    expect(await hot.assemble(f.call)).toEqual({
      kind: 'invalid',
      field: 'history.page',
      reason: 'unsupported-format',
    })
    expect(slot.staged.length).toBe(before)
  })

  it('CX-14 rejects a tail that ends before the upper bound and a cursor that changed evidence', async () => {
    const f = createAssemblyFixture({ rows: mixed() })
    const slot = oneSlot()
    const hot = operationsOf(f, slot.reuse)
    growTo(f, 2)
    candidateOf(await hot.assemble(f.call))
    slot.commit()
    const reader = f.history as unknown as { read: AssemblyFixture['history']['read'] }
    const original = reader.read.bind(f.history)
    growTo(f, 5)
    reader.read = async input => {
      const result = await original(input)
      return result.kind === 'page'
        ? { kind: 'page', page: { rows: result.page.rows.slice(0, 1), next: null } }
        : result
    }
    expect(await hot.assemble(f.call)).toMatchObject({ kind: 'invalid', field: 'history.page' })
    reader.read = async input => {
      const result = await original(input)
      return result.kind === 'page'
        ? {
            kind: 'page',
            page: {
              rows: result.page.rows.slice(0, 1),
              next: { evidence: { ...input.evidence, epoch }, after: seq(3) },
            },
          }
        : result
    }
    expect(await hot.assemble(f.call)).toMatchObject({
      kind: 'invalid',
      field: 'history.cursor',
      reason: 'cursor-invalidated',
    })
  })

  it('CX-14 never joins pages of two epochs', async () => {
    const rows = [row(0), row(1), row(2)]
    const f = createAssemblyFixture({ rows })
    const slot = oneSlot()
    const hot = operationsOf(f, slot.reuse)
    growTo(f, 1)
    candidateOf(await hot.assemble(f.call))
    slot.commit()
    const next = f.history.commitCompaction({
      role: 'compaction',
      id: rows[2]!.message.id,
      blocks: [text('summary')],
      covers: { from: rows[0]!.entry, to: rows[0]!.entry },
      retained: [],
      derivation: evidence,
    })
    const current = f.history.evidence()
    f.sources.update('history', { ...f.sources.values().history, evidence: current })
    const { counts } = counted(f)
    const warm = candidateOf(await hot.assemble(f.call))
    const cold = candidateOf(await operationsOf(f).assemble(f.call))
    expect(current.epoch).toBe(next)
    expect(warm.preparation.rows).toEqual(cold.preparation.rows)
    expect(warm.preparation.view).toEqual(cold.preparation.view)
    // The new epoch was read from its first row, not from the end of the old rows.
    expect(counts.rows).toBe(warm.preparation.rows.length * 2)
  })

  it('CX-14 never stages the material of an attempt that the group retried', async () => {
    const f = createAssemblyFixture({ rows: mixed() })
    const slot = oneSlot()
    const hot = operationsOf(f, slot.reuse)
    growTo(f, 1)
    f.sources.afterSourceRead('history', () => growTo(f, 3))
    const result = candidateOf(await hot.assemble(f.call))
    expect(slot.staged).toHaveLength(1)
    expect(slot.staged[0]?.history.evidence.upper).toEqual(upper(3))
    expect(result.preparation.rows).toHaveLength(4)
  })
})

describe('cached material is used only for the call it belongs to', () => {
  it('CX-14 ignores material of another principal, generation, position or purpose', async () => {
    const f = createAssemblyFixture({ rows: mixed() })
    const slot = oneSlot()
    const hot = operationsOf(f, slot.reuse)
    growTo(f, 2)
    candidateOf(await hot.assemble(f.call))
    const [material] = slot.staged
    if (material === undefined) throw new Error('nothing staged')
    const { counts } = counted(f)
    growTo(f, 4)
    const foreign: readonly CachedAssemblyMaterial[] = [
      { ...material, key: { ...material.key, principal: 'principal_other' as never } },
      { ...material, key: { ...material.key, generation: 'generation_other' as never } },
      {
        ...material,
        key: {
          ...material.key,
          identity: { ...material.key.identity, position: 'position:other' as never },
        },
      },
      {
        ...material,
        key: { ...material.key, identity: { ...material.key.identity, purpose: 'extension' } },
      },
    ]
    for (const other of foreign) {
      slot.put(other)
      counts.rows = 0
      candidateOf(await hot.assemble(f.call))
      // Everything is read again from the first row.
      expect(counts.rows).toBe(5)
    }
  })

  it('CX-14 asks for material only after the call was admitted', async () => {
    const f = createAssemblyFixture({ rows: mixed() })
    eligibilityOf(f).set({ kind: 'denied' })
    const slot = oneSlot()
    const result = await operationsOf(f, slot.reuse).assemble(f.call)
    expect(result).toMatchObject({ kind: 'denied' })
    expect(slot.loads).toEqual([])
  })

  it('CX-14 keeps the eligibility check before the result leaves, with hot material', async () => {
    const f = createAssemblyFixture({ rows: mixed() })
    const slot = oneSlot()
    const hot = operationsOf(f, slot.reuse)
    candidateOf(await hot.assemble(f.call))
    slot.commit()
    f.sources.afterSourceRead('control', () => eligibilityOf(f).set({ kind: 'denied' }))
    expect(await hot.assemble(f.call)).toMatchObject({ kind: 'denied' })
  })

  it('CX-14 measures and takes a lease again on every hot call', async () => {
    const f = createAssemblyFixture({ rows: mixed() })
    const slot = oneSlot()
    const hot = operationsOf(f, slot.reuse)
    candidateOf(await hot.assemble(f.call))
    slot.commit()
    const before = f.preparation.calls().length
    candidateOf(await hot.assemble(f.call))
    candidateOf(await hot.assemble(f.call))
    // Each call measures the whole request and its fixed part, each with its own lease.
    expect(f.preparation.calls().length - before).toBe(4)
  })
})

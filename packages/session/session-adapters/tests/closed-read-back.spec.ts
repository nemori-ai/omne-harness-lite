import { memoryAccess } from '@omne-harness/session-contract/testing'
import { describe, expect, it } from 'vitest'
import { fetchClosed, heldOrigins, restoreRecords } from '../src/cordis/item-read.ts'
import { SharedMap } from '../src/journal/shared-map.ts'
import {
  emptySessionView,
  foldItems,
  type PublishedBatch,
  type SessionJournalView,
} from '../src/journal/index.ts'
import {
  NeedItems,
  fullViewOf,
  itemText,
  landOnce,
  needUnder,
  underText,
  type ClosedTable,
  type ItemRef,
} from '../src/testing/closed-items.ts'
import { acceptedInput, inputAcceptanceOf } from '../src/testing/journal-handoff-checks.ts'
import { createCell } from '../src/testing/root.ts'
import { evidence } from './fixtures/journal-facts.ts'

// What a core reads back of the items it closed, and what it keeps of a warm copy, a rule at a time.

const E = 'exe_read_back' as never
const OTHER = 'exe_other' as never

const batchOf = (
  execution: never,
  pub: number,
  facts: PublishedBatch['facts'],
): PublishedBatch => ({
  execution,
  envelope: {
    op: `op-${String(pub)}` as never,
    digest: `d-${String(pub)}`,
    rev: 0,
    gen: '1',
    kinds: [],
  },
  facts,
  pub,
})
const fence = (operation: string): PublishedBatch['facts'][number] => ({
  kind: 'fence.started',
  operation: operation as never,
  guard: { owner: 'agent', resource: 'attachment', revision: '1', evidence: evidence('g') },
  fence: evidence(`fence-${operation}`),
})
const tableOf = (closedComplete: boolean): ClosedTable => ({
  closed: new SharedMap(),
  closedComplete,
})

describe('the closed items under a key prefix', () => {
  const ref: ItemRef = { execution: E, family: 'custody', item: 'h/', under: true }
  const put = (table: ClosedTable, at: Omit<ItemRef, 'under'>, body: unknown) =>
    table.closed.set(itemText(at), body)

  it('a table that is the whole store answers the held items of that execution and family under the prefix', () => {
    const table = tableOf(true)
    put(table, { execution: E, family: 'custody', item: 'h/1' }, { n: 1 })
    put(table, { execution: E, family: 'custody', item: 'h/2' }, null)
    put(table, { execution: E, family: 'custody', item: 'g/1' }, { n: 2 })
    put(table, { execution: E, family: 'handoff', item: 'h/1' }, { n: 3 })
    put(table, { execution: OTHER, family: 'custody', item: 'h/1' }, { n: 4 })
    // What another call read under a longer prefix is a note of the table, not an item.
    table.closed.set(underText({ execution: E, family: 'custody', item: 'h/9/' }), ['h/9/x'])
    expect([...needUnder(table, ref)]).toEqual([['h/1', { n: 1 }]])
  })

  it('a table that is a part of the store answers what the call read under the prefix, and asks when it read nothing', () => {
    const table = tableOf(false)
    expect(() => needUnder(table, ref)).toThrow(NeedItems)
    try {
      needUnder(table, ref)
    } catch (error) {
      expect((error as NeedItems).refs).toEqual([ref])
    }
    table.closed.set(underText(ref), ['h/1', 'h/2'])
    put(table, { execution: E, family: 'custody', item: 'h/1' }, { n: 1 })
    expect([...needUnder(table, ref)]).toEqual([
      ['h/1', { n: 1 }],
      ['h/2', null],
    ])
  })

  it('what a call read under one prefix does not stand for another prefix', async () => {
    const lender = {
      tenantText: 'tenant',
      session: 'session',
      fetched: new Map<string, unknown>([[underText(ref), []]]),
      lentBlocks: new Map<string, string>(),
    }
    let reads = 0
    const read = async () => {
      reads += 1
      return { kind: 'unread' as const, reason: 'scripted' }
    }
    const another: ItemRef = { ...ref, item: 'g/' }
    expect(await fetchClosed(read as never, lender, [another])).toContain('scripted')
    expect(reads).toBe(1)
  })
})

describe('the whole record of an execution', () => {
  it('is its open items with the items it closed: not those of another execution, not the notes of the table, not the operations', () => {
    const table = tableOf(true)
    let view: SessionJournalView = emptySessionView()
    view = landOnce(table, view, batchOf(E, 1, [fence('top_a')]))!
    view = landOnce(table, view, batchOf(OTHER, 2, [fence('top_b')]))!
    table.closed.set(underText({ execution: E, family: 'fence', item: 'top' }), ['top_a'])
    const open = view.executions.get(E)!
    expect(open.fences).toEqual([])
    const whole = fullViewOf(open, table.closed)
    expect(whole.fences.map(item => item.operation)).toEqual(['top_a'])
    // An operation closes at birth and is read apart: the whole record does not carry them.
    expect(table.closed.has(itemText({ execution: E, family: 'op', item: 'op-1' }))).toBe(true)
    expect(whole.ops.size).toBe(0)
  })
})

describe('the call origins a book keeps when it lets a warm copy go', () => {
  const held = (consumption: string): PublishedBatch['facts'] => [
    { kind: 'cursor.moved', step: 'step-1' as never, members: { step: 'step-1' as never } },
    {
      kind: 'hold.changed',
      step: 'step-1' as never,
      held: [['consumption', consumption]],
      released: [],
    },
  ]

  it('are those of the calls an execution in view still holds', () => {
    const { view } = foldItems(emptySessionView(), batchOf(E, 1, held('c-held')))
    const origins = new Map([
      [`${String(E)}\0c-held`, 'kept'],
      [`${String(E)}\0c-let-go`, 'dropped'],
      [`${String(OTHER)}\0c-held`, 'not in view'],
    ])
    expect([...heldOrigins(origins, view)]).toEqual([[`${String(E)}\0c-held`, 'kept']])
  })
})

describe('the records a book puts back into a cold core', () => {
  it('are every fragment it projected, the origins it kept and the blocks it parsed', () => {
    const access = memoryAccess('tester', 'read-back')
    const cell = createCell<string>(access.tenant, access.session, {
      authorize: () => undefined,
      advances: () => false,
      participate: () => undefined,
      committed: () => undefined,
    })
    const receiving = Object.fromEntries(
      Object.keys(cell.state().receiving).map(name => [name, new Map()]),
    )
    const one = (value: unknown) => new Map([['k', value]])
    restoreRecords(
      { view: emptySessionView(), parsed: one('block'), origins: one('kept') as never },
      cell,
      {
        executions: one('execution'),
        operations: one('operation'),
        fragments: {
          eventReceipts: one('receipt'),
          pendingEvents: one('pending'),
          callOrigins: new Map([['projected', 'origin']]),
          human: one('human'),
          indexedEvents: one(7),
        },
        receiving,
      } as never,
    )
    const { agent } = cell.state()
    expect([
      agent.blobs.get('k'),
      agent.executions.get('k'),
      agent.operations.get('k'),
      agent.eventReceipts.get('k'),
      agent.pendingEvents.get('k'),
      agent.callOrigins.get('projected'),
      agent.callOrigins.get('k'),
      agent.human.get('k'),
      agent.indexedEvents.get('k'),
      agent.closedComplete,
      agent.log,
    ]).toEqual([
      'block',
      'execution',
      'operation',
      'receipt',
      'pending',
      'origin',
      'kept',
      'human',
      7,
      false,
      [],
    ])
  })
})

describe('an accepted input by its id', () => {
  const input = 'input-1' as never
  const message = { digest: 'message', size: 1 }
  const closed = {
    input,
    place: 0,
    entry: 'entry-1',
    message,
    source: null,
    priority: 'ordinary',
    watermark: evidence('w'),
    pub: 1,
    revision: 4,
  }
  const record = { id: input, content: 'hello', source: null, priority: 'ordinary' }
  const tableWith = (complete: boolean, held: boolean) => {
    const table = { ...tableOf(complete), blobs: new Map<string, unknown>([['message', 'hello']]) }
    if (held) table.closed.set(itemText({ execution: E, family: 'input', item: input }), closed)
    return table as never
  }
  const executionOf = (inputs: readonly unknown[], revisions: readonly [unknown, number][] = []) =>
    ({
      id: E,
      state: { kind: 'advancing' },
      handoffs: [],
      inputs,
      inputRevisions: new Map(revisions),
    }) as never

  it('is the one the record holds, with its revision, whatever places before it are empty', () => {
    const inputs = Array.from({ length: 2 })
    inputs[1] = record
    expect(
      acceptedInput(tableWith(true, false), executionOf(inputs, [[input, 3]]), input, 'new-input'),
    ).toEqual({ value: record, revision: 3 })
  })

  it('held by the record with no revision is a defect', () => {
    expect(() =>
      acceptedInput(tableWith(true, false), executionOf([record]), input, 'new-input'),
    ).toThrow('an accepted input has no revision')
  })

  it('is the closed item when the record does not hold it, and nothing when the store never held it', () => {
    expect(acceptedInput(tableWith(true, true), executionOf([]), input, 'new-input')).toEqual({
      value: record,
      revision: 4,
    })
    expect(
      acceptedInput(tableWith(true, false), executionOf([]), input, 'new-input'),
    ).toBeUndefined()
  })

  it('a write that recognizes the input reads it back; another write does not', () => {
    const part = tableWith(false, false)
    expect(acceptedInput(part, executionOf([]), input, 'new-input')).toBeUndefined()
    expect(() => acceptedInput(part, executionOf([]), input, 'recognize-input')).toThrow(NeedItems)
  })

  describe('and its acceptance', () => {
    const handoff = { kind: 'input', execution: E, entry: 'entry-1', input }
    const accepted = {
      handoff,
      request: { kind: 'input', entry: 'entry-1' },
      resolution: { kind: 'recorded', outcome: 'outcome' },
      history: { kind: 'committed' },
    }
    const holding = (handoffs: readonly unknown[]) =>
      ({
        id: E,
        state: { kind: 'advancing' },
        handoffs,
        inputs: [],
        inputRevisions: new Map(),
      }) as never
    const inView = {
      inputs: [
        { input: 'input-0', entry: 'entry-0' },
        { input, entry: 'entry-1' },
      ],
    }

    it('is the recorded hand-off of the entry that accepted it', () => {
      expect(
        inputAcceptanceOf(tableWith(true, false), holding([accepted]), inView as never, input),
      ).toEqual({ entry: 'entry-1', handoff, outcome: 'outcome' })
    })

    it('is nothing for an input the execution never accepted, and for one whose hand-off the store never held', () => {
      const table = tableWith(true, false)
      expect(inputAcceptanceOf(table, holding([accepted]), { inputs: [] }, input)).toBeNull()
      expect(inputAcceptanceOf(table, holding([]), inView as never, input)).toBeNull()
    })
  })
})

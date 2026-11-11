// The queue transitions of one scope (P02): a call takes a slot (Hold), gives it up while its wait
// has no decision (Park) and takes its place in the order again (Requeue). Each transition is a
// function of the entries of the scope, so the cases state the entries and read what the queue
// answers and writes.
import { describe, expect, it } from 'vitest'
import type { ToolCallId, ToolOperationId } from '@omne-harness/tool-contract'
import {
  decideQueueHold,
  decideQueuePark,
  decideQueueRequeue,
  type QueueSnapshot,
} from '../src/ledger-start.ts'
import type { QueueEntryRecord } from '../src/ledger-store.ts'

const call = (name: string) => name as ToolCallId
const op = (name: string) => name as ToolOperationId

type Stage = QueueEntryRecord['stage']
function entry(
  name: string,
  stage: Stage,
  ordinal: string,
  options: Partial<Pick<QueueEntryRecord, 'tool' | 'limit' | 'scopeBudget' | 'operation'>> = {},
): QueueEntryRecord {
  return {
    call: call(name),
    ordinal,
    stage,
    operation: options.operation ?? op(`op-${name}`),
    tool: options.tool ?? 'tool-a',
    limit: options.limit ?? null,
    scopeBudget: options.scopeBudget ?? null,
  }
}

function snapshot(entries: readonly QueueEntryRecord[], next = '100'): QueueSnapshot {
  return {
    domain: { kind: 'queue' } as QueueSnapshot['domain'],
    revision: '1' as QueueSnapshot['revision'],
    entries: new Map(entries.map(item => [item.call, item])),
    released: new Set(),
    next,
  }
}

const unavailable = {
  kind: 'reply',
  outcome: { failure: { kind: 'unavailable', dependency: 'tool-queue' } },
}
const answered = (value: unknown) => ({ kind: 'reply', outcome: { ok: value } })
const written = (decision: { kind: string; writes?: readonly unknown[] }) =>
  decision.kind === 'commit' ? (decision.writes ?? []) : []

describe('taking a slot (Hold)', () => {
  const hold = (entries: readonly QueueEntryRecord[], keep?: boolean, operation = 'op-hold') =>
    decideQueueHold(snapshot(entries), {
      call: call('me'),
      operation: op(operation),
      ...(keep === undefined ? {} : { keep }),
    })

  it('is unavailable for a call with no entry, one not enqueued yet and one that is parked', () => {
    expect(hold([])).toMatchObject(unavailable)
    expect(hold([entry('me', 'preparing', '1')])).toMatchObject(unavailable)
    expect(hold([entry('me', 'parked', '1')])).toMatchObject(unavailable)
  })

  it('holds a ready entry at the head, stamped with the operation, and writes only that entry', () => {
    const decision = hold([entry('me', 'ready', '1')])
    expect(decision).toMatchObject({
      kind: 'commit',
      value: { kind: 'held', entry: { call: 'me', stage: 'held', operation: 'op-hold' } },
    })
    expect(written(decision)).toMatchObject([
      {
        kind: 'put',
        record: { kind: 'queue-entry', entry: { stage: 'held', operation: 'op-hold' } },
      },
    ])
  })

  it('answers a held entry with itself for the operation that held it, and a conflict for another', () => {
    const held = entry('me', 'held', '1', { operation: op('op-hold') })
    expect(hold([held])).toEqual(answered({ kind: 'held', entry: held }))
    expect(hold([held], undefined, 'op-other')).toEqual({
      kind: 'reply',
      outcome: { failure: { kind: 'conflict', operation: op('op-other') } },
    })
    // Without the resume mark an entry held by another operation is not taken over.
    expect(hold([held], false, 'op-other')).toMatchObject({
      kind: 'reply',
      outcome: { failure: { kind: 'conflict' } },
    })
  })

  it('lets a resume keep the slot its call still holds, and stamps it with the resume operation', () => {
    const held = entry('me', 'held', '1', { operation: op('op-start') })
    const decision = hold([held], true, 'op-resume')
    expect(decision).toMatchObject({
      kind: 'commit',
      value: { kind: 'held', entry: { stage: 'held', operation: 'op-resume' } },
    })
    expect(written(decision)).toHaveLength(1)
    // The resume that holds the slot already recalls it and writes nothing.
    expect(hold([{ ...held, operation: op('op-resume') }], true, 'op-resume')).toMatchObject({
      kind: 'reply',
      outcome: { ok: { kind: 'held' } },
    })
  })

  it('takes a slot for a ready entry under a resume mark as it does without it', () => {
    expect(hold([entry('me', 'ready', '1')], true, 'op-resume')).toMatchObject({
      kind: 'commit',
      value: { kind: 'held', entry: { stage: 'held', operation: 'op-resume' } },
    })
  })

  it.each(['preparing', 'ready'] as const)(
    'waits behind an earlier %s entry of any tool',
    stage => {
      const decision = hold([
        entry('first', stage, '1', { tool: 'tool-b' }),
        entry('me', 'ready', '2'),
      ])
      expect(decision).toMatchObject(answered({ kind: 'waiting', ahead: 1, toolHeld: 0, held: 0 }))
      expect(written(decision)).toEqual([])
    },
  )

  it('is not held back by entries that hold a slot, are parked, or come later', () => {
    const decision = hold([
      entry('parked', 'parked', '1'),
      entry('holder', 'held', '2', { tool: 'tool-b' }),
      entry('me', 'ready', '3'),
      entry('later', 'ready', '4'),
    ])
    expect(decision).toMatchObject({ kind: 'commit', value: { kind: 'held' } })
  })

  it('orders ordinals as numbers, not as text', () => {
    const decision = hold([entry('first', 'ready', '9'), entry('me', 'ready', '10')])
    expect(decision).toMatchObject(answered({ kind: 'waiting', ahead: 1 }))
  })

  it('waits when the held entries of its tool reach its limit, and counts only its own tool', () => {
    const me = entry('me', 'ready', '3', { limit: 2 })
    const sameTool = [entry('a', 'held', '1'), entry('b', 'held', '2')]
    expect(hold([...sameTool, me])).toMatchObject(
      answered({ kind: 'waiting', ahead: 0, toolHeld: 2, held: 2 }),
    )
    const otherTool = sameTool.map(item => ({ ...item, tool: 'tool-b' }))
    expect(hold([...otherTool, me])).toMatchObject({ kind: 'commit', value: { kind: 'held' } })
    expect(hold([sameTool[0] as QueueEntryRecord, me])).toMatchObject({
      kind: 'commit',
      value: { kind: 'held' },
    })
  })

  it('waits when the held entries of the scope reach the budget, whatever their tool', () => {
    const me = entry('me', 'ready', '3', { scopeBudget: 2 })
    const others = [
      entry('a', 'held', '1', { tool: 'tool-b' }),
      entry('b', 'held', '2', { tool: 'tool-c' }),
    ]
    expect(hold([...others, me])).toMatchObject(
      answered({ kind: 'waiting', ahead: 0, toolHeld: 0, held: 2 }),
    )
    expect(hold([others[0] as QueueEntryRecord, me])).toMatchObject({
      kind: 'commit',
      value: { kind: 'held' },
    })
  })
})

describe('giving a slot up (Park)', () => {
  const park = (entries: readonly QueueEntryRecord[], operation = 'op-park', holder = 'op-start') =>
    decideQueuePark(snapshot(entries), {
      call: call('me'),
      operation: op(operation),
      holder: op(holder),
    })
  const notParked = (reason: string) => answered({ kind: 'not-parked', reason })

  it('parks the entry that the suspended segment held, stamped with the park operation', () => {
    const decision = park([entry('me', 'held', '1', { operation: op('op-start') })])
    expect(decision).toMatchObject({
      kind: 'commit',
      value: { kind: 'parked', entry: { stage: 'parked', operation: 'op-park', ordinal: '1' } },
    })
    expect(written(decision)).toHaveLength(1)
  })

  it('answers a call with no entry that nothing was parked', () => {
    expect(park([])).toEqual(notParked('no-entry'))
  })

  it('recalls the park of the same operation and writes nothing', () => {
    const parked = entry('me', 'parked', '1', { operation: op('op-park') })
    expect(park([parked])).toEqual(answered({ kind: 'parked', entry: parked }))
  })

  it.each([
    [
      'an entry parked by another operation',
      entry('me', 'parked', '1', { operation: op('op-else') }),
    ],
    [
      'a held entry that carries the park operation without being parked',
      entry('me', 'held', '1', { operation: op('op-park') }),
    ],
    ['an entry that is only ready', entry('me', 'ready', '1', { operation: op('op-start') })],
    [
      'an entry that a later segment holds',
      entry('me', 'held', '1', { operation: op('op-resume') }),
    ],
  ])('leaves %s as it is', (_name, existing) => {
    const decision = park([existing])
    expect(decision).toEqual(notParked('not-held'))
  })
})

describe('taking the place again (Requeue)', () => {
  const requeue = (entries: readonly QueueEntryRecord[], operation = 'op-requeue') =>
    decideQueueRequeue(snapshot(entries, '7'), { call: call('me'), operation: op(operation) })

  it('puts a parked entry at the next ordinal of the scope, ready, under the operation', () => {
    const decision = requeue([entry('me', 'parked', '1')])
    expect(decision).toMatchObject({
      kind: 'commit',
      value: {
        kind: 'requeued',
        entry: { stage: 'ready', ordinal: '7', operation: 'op-requeue' },
      },
    })
  })

  it('keeps the slot of a held entry, and recalls an entry this operation requeued', () => {
    const held = entry('me', 'held', '1')
    expect(requeue([held])).toEqual(answered({ kind: 'kept', entry: held }))
    const ready = entry('me', 'ready', '7', { operation: op('op-requeue') })
    expect(requeue([ready])).toEqual(answered({ kind: 'requeued', entry: ready }))
  })

  it('is unavailable for a missing entry, a ready entry of another operation and a preparing one', () => {
    expect(requeue([])).toMatchObject(unavailable)
    expect(requeue([entry('me', 'ready', '7')])).toMatchObject(unavailable)
    expect(requeue([entry('me', 'preparing', '7')])).toMatchObject(unavailable)
  })
})

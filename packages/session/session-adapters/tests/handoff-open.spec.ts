import { describe, expect, it } from 'vitest'
import {
  emptySessionView,
  foldItems,
  type PublishedBatch,
  type SessionJournalView,
} from '../src/journal/index.ts'
import { custodyKey, handoffKey } from '../src/journal/view.ts'
import { evidence } from './fixtures/journal-facts.ts'

// When a hand-off and the custody attempts recorded under it are open, a clause at a time.

const EXECUTION = 'exe_handoff' as never
const H = { kind: 'execution' as const, execution: EXECUTION, operation: 'h-1' as never }
const REF = { digest: 'c'.repeat(64), size: 2 }
const at = (n: number) => `step-${String(n)}` as never

type Facts = PublishedBatch['facts']

function folded(batches: readonly Facts[]) {
  let view: SessionJournalView = emptySessionView()
  let changes: ReturnType<typeof foldItems>['changes'] = []
  for (const [index, facts] of batches.entries()) {
    const pub = index + 1
    const result = foldItems(view, {
      execution: EXECUTION,
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
    view = result.view
    changes = result.changes
  }
  const execution = view.executions.get(EXECUTION)!
  return {
    execution,
    changes,
    handoffOpen: execution.handoffs.has(handoffKey(H)),
    custodyOpen: (attempt: string) => execution.custodies.has(custodyKey(H, attempt as never)),
  }
}

const moved = (step: number, members: object = {}): Facts[number] => ({
  kind: 'cursor.moved',
  step: at(step),
  members: { step: at(step), ...members },
})
const prepared: Facts[number] = {
  kind: 'handoff.prepared',
  handoff: H,
  step: at(1),
  request: REF,
  prepared: evidence('prepared'),
}
const resolved: Facts[number] = {
  kind: 'handoff.resolved',
  handoff: H,
  resolution: 'recorded',
  outcome: REF,
  history: evidence('history'),
}
const retired: Facts[number] = {
  kind: 'handoff.retired',
  handoff: H,
  reason: evidence('reason'),
  excluded: REF,
}
const recorded: Facts[number] = {
  kind: 'handoff.recorded',
  handoff: H,
  resolution: 'recorded',
  outcome: REF,
  predecessor: null,
  custody: null,
}
const holds = (side: 'held' | 'released', step: number): Facts[number] => ({
  kind: 'hold.changed',
  step: at(step),
  held: side === 'held' ? [['handoff', handoffKey(H)]] : [],
  released: side === 'released' ? [['handoff', handoffKey(H)]] : [],
})

describe('a hand-off prepared at a step', () => {
  it('is open while it is neither resolved nor retired, whatever the step', () => {
    expect(folded([[moved(1), prepared], [moved(2)]]).handoffOpen).toBe(true)
  })

  it('once resolved, is open at its step and closed after it', () => {
    expect(folded([[moved(1), prepared], [resolved]]).handoffOpen).toBe(true)
    expect(folded([[moved(1), prepared], [resolved], [moved(2)]]).handoffOpen).toBe(false)
  })

  it('once retired, is closed after its step', () => {
    expect(folded([[moved(1), prepared], [retired]]).handoffOpen).toBe(true)
    expect(folded([[moved(1), prepared], [retired], [moved(2)]]).handoffOpen).toBe(false)
  })

  it('once resolved, is open after its step while the cursor names it, and closed when it names another or none', () => {
    const named = [[moved(1), prepared], [resolved], [moved(2, { currentHandoff: H })]]
    expect(folded(named).handoffOpen).toBe(true)
    expect(folded([...named, [moved(2, { currentHandoff: null })]]).handoffOpen).toBe(false)
    const other = { ...H, operation: 'h-other' as never }
    expect(
      folded([[moved(1), prepared], [resolved], [moved(2, { currentHandoff: other })]]).handoffOpen,
    ).toBe(false)
  })

  it('once resolved, is open after its step while the checkpoint holds it, and closed when it lets go', () => {
    const held = [[moved(1), prepared], [resolved, holds('held', 1)], [moved(2)]]
    expect(folded(held).handoffOpen).toBe(true)
    expect(folded([...held, [holds('released', 2)]]).handoffOpen).toBe(false)
  })
})

describe('the hand-off of an input', () => {
  const input = 'input-1' as never
  const I = { kind: 'input' as const, execution: EXECUTION, entry: 'entry-1' as never, input }
  const accepted: Facts = [
    moved(1),
    {
      kind: 'input.accepted',
      input,
      entry: I.entry,
      message: REF,
      source: evidence('source'),
      priority: 'ordinary',
      watermark: evidence('watermark'),
    },
    { ...resolved, handoff: I },
  ]

  it('stays open after its step while the input is open', () => {
    const { execution } = folded([accepted, [moved(2)]])
    expect(execution.handoffs.has(handoffKey(I))).toBe(true)
  })

  it('an input accepted twice is one input at one place', () => {
    const { execution } = folded([accepted, [accepted[1]!]])
    expect([execution.inputs.length, execution.accepted]).toEqual([1, 1])
  })
})

describe('a custody attempt', () => {
  it('is open with its hand-off and closes in the fold that closes the hand-off', () => {
    const open = folded([[moved(1), prepared], [resolved], [recorded]])
    expect([open.handoffOpen, open.custodyOpen('op-3')]).toEqual([true, true])
    const closed = folded([[moved(1), prepared], [resolved], [recorded], [moved(2)]])
    expect([closed.handoffOpen, closed.custodyOpen('op-3')]).toEqual([false, false])
    expect(closed.changes).toContainEqual(
      expect.objectContaining({ family: 'custody', change: 'changed', open: false }),
    )
  })

  it('recorded after its hand-off closed is closed at birth', () => {
    const late = folded([[moved(1), prepared], [resolved], [moved(2)], [recorded]])
    expect(late.custodyOpen('op-4')).toBe(false)
    expect(late.changes).toContainEqual(
      expect.objectContaining({ family: 'custody', change: 'opened', open: false }),
    )
  })
})

describe('a start fence', () => {
  it('takes an entry place, as a received result does', () => {
    const { execution } = folded([
      [
        moved(1),
        {
          kind: 'fence.started',
          operation: 'top_fence' as never,
          guard: { owner: 'agent', resource: 'attachment', revision: '1', evidence: evidence('g') },
          fence: evidence('fence'),
        },
      ],
    ])
    expect(execution.entries).toBe(1)
  })
})

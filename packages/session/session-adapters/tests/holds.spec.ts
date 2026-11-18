import type { AgentCheckpoint } from '@omne-harness/agent-contract'
import { expect, it } from 'vitest'
import { FACT_MAX_BYTES, bytesOf, heldBy, holdText, holdsMoved } from '../src/journal/index.ts'
import { canonical } from '../src/testing/canonical.ts'
import { materialHold } from '../src/journal/facts.ts'
import { handoffKey, type HoldView } from '../src/journal/view.ts'

// What a checkpoint holds, and the change between two checkpoints, with no journal behind them.

const source = (name: string) => ({ owner: 'suite', record: name, revision: '1', digest: name })
const call = (name: string) => ({
  action: `action-${name}`,
  consumption: `consumption-${name}`,
  fixed: source(`fixed-${name}`),
})
const checkpointOf = (parts: object): AgentCheckpoint =>
  ({ step: 'step-1', calls: [], batch: null, passages: [], compaction: null, ...parts }) as never
const holding = (kind: HoldView['kind'], id: string, released = false): HoldView => ({
  kind,
  id,
  pub: 1,
  ord: 0,
  released,
})
const texts = (refs: readonly (readonly [string, string])[]) =>
  refs.map(ref => holdText(ref as never)).sort()

it('a checkpoint holds its calls, its batch, the hand-offs of its slots and the sources it reads', () => {
  const handoff = { kind: 'execution', execution: 'exe', operation: 'h-1' } as never
  const checkpoint = checkpointOf({
    calls: [call('a')],
    compaction: { consumption: 'consumption-compaction' },
    batch: {
      actions: [
        { id: 'action-allowed', judgment: { kind: 'allowed', request: source('request') } },
        { id: 'action-answered', judgment: { kind: 'denied', answer: source('answer') } },
        { id: 'action-denied', judgment: { kind: 'denied' } },
        { id: 'action-called', judgment: { kind: 'pending' }, call: call('b') },
      ],
      slots: [{ handoff }, { handoff: null }],
    },
  })
  const material = (name: string) => `material/${materialHold(canonical(source(name)))}`
  expect(texts(heldBy(checkpoint))).toEqual(
    [
      'action/action-a',
      'action/action-allowed',
      'action/action-answered',
      'action/action-denied',
      'action/action-called',
      'consumption/consumption-a',
      'consumption/consumption-b',
      'consumption/consumption-compaction',
      `handoff/${handoffKey(handoff)}`,
      material('request'),
      material('answer'),
      material('fixed-a'),
      material('fixed-b'),
    ].sort(),
  )
})

it('a checkpoint that holds nothing names nothing', () => {
  expect(heldBy(checkpointOf({}))).toEqual([])
})

it('the change names what the checkpoint gains and lets go, and nothing it still holds or let go before', () => {
  const kept = call('kept')
  const gained = call('gained')
  const holds = [
    holding('action', kept.action),
    holding('consumption', kept.consumption),
    holding('material', materialHold(canonical(kept.fixed))),
    holding('action', 'action-left'),
    holding('action', 'action-long-gone', true),
  ]
  const moved = holdsMoved({ holds }, checkpointOf({ calls: [kept, gained] }))
  expect(moved).toHaveLength(1)
  expect(texts(moved[0]!.held)).toEqual(
    [
      `action/${gained.action}`,
      `consumption/${gained.consumption}`,
      `material/${materialHold(canonical(gained.fixed))}`,
    ].sort(),
  )
  expect(texts(moved[0]!.released)).toEqual(['action/action-left'])
})

it('a checkpoint that holds what the view holds changes nothing: no fact', () => {
  const kept = call('kept')
  const holds = [
    holding('action', kept.action),
    holding('consumption', kept.consumption),
    holding('material', materialHold(canonical(kept.fixed))),
  ]
  expect(holdsMoved({ holds }, checkpointOf({ calls: [kept] }))).toEqual([])
  expect(holdsMoved({ holds: [] }, checkpointOf({}))).toEqual([])
})

it('a hold the view let go is held anew when the checkpoint names it again', () => {
  const again = call('again')
  const holds = [holding('action', again.action, true)]
  const [fact] = holdsMoved({ holds }, checkpointOf({ calls: [again] }))
  expect(texts(fact!.held)).toContain(`action/${again.action}`)
  expect(fact!.released).toEqual([])
})

it('a change too large for one fact is split, every fact within the limit and none empty', () => {
  const calls = Array.from({ length: 120 }, (_, index) => call(`wide-${String(index)}`))
  const moved = holdsMoved({ holds: [] }, checkpointOf({ calls }))
  expect(moved.length).toBeGreaterThan(1)
  for (const fact of moved) {
    expect(bytesOf(fact)).toBeLessThanOrEqual(FACT_MAX_BYTES)
    expect(fact.held.length + fact.released.length).toBeGreaterThan(0)
  }
  expect(texts(moved.flatMap(fact => fact.held))).toEqual(texts(heldBy(checkpointOf({ calls }))))
  // The split keeps the order, so a replay of the facts holds exactly what one fact would.
  const letGo = holdsMoved(
    { holds: heldBy(checkpointOf({ calls })).map(([kind, id]) => holding(kind, id)) },
    checkpointOf({}),
  )
  expect(letGo.length).toBeGreaterThan(1)
  expect(letGo.flatMap(fact => fact.released)).toHaveLength(360)
})

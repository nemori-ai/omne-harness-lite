import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeEvents } from './events.mjs'
import { syntheticEvents } from './synthetic.mjs'

test('overlapping external waits are deducted once and repeated stages use their union', () => {
  const events = syntheticEvents(1)
  const round = events.find(event => event.eventKind === 'round-complete')
  round.endMs = round.startMs + 100
  const wait = events.find(event => event.eventKind === 'external-wait')
  wait.startMs = round.startMs + 10
  wait.endMs = round.startMs + 40
  events.push({
    ...wait,
    invocationId: 'overlap',
    startMs: round.startMs + 30,
    endMs: round.startMs + 60,
  })
  const stage = events.find(event => event.eventKind === 'stage')
  events.push({ ...stage, startMs: stage.startMs + 2, endMs: stage.endMs + 2 })
  const row = normalizeEvents(events, 1, { kind: 'synthetic' })
  assert.equal(row.ownOverhead.value, 50)
  assert.equal(row.stages.sessionIO.value, 12)
  assert.equal(row.intervals.sessionIO.length, 2)
})

test('cross-clock waits and absent stages stay unmeasured', () => {
  const events = syntheticEvents(1)
  events.find(event => event.eventKind === 'external-wait').clock.generation = 'other'
  const row = normalizeEvents(events, 1, { kind: 'synthetic' })
  assert.equal(row.ownOverhead.state, 'unmeasured')
  const missing = events.filter(event => event.stage !== 'sessionIO')
  assert.equal(
    normalizeEvents(missing, 1, { kind: 'synthetic' }).stages.sessionIO.state,
    'unmeasured',
  )
})

test('invalid, duplicate completion, wrong-round and unsupported events are rejected', () => {
  const events = syntheticEvents(1)
  const normalize = input => normalizeEvents(input, 1, { kind: 'synthetic' })
  assert.throws(() => normalize([...events, events[0]]), /completion/)
  assert.throws(() => normalize([{ ...events[0], round: 2 }]), /round/)
  assert.throws(() => normalize([{ ...events[0], eventKind: 'execute-code' }]), /eventKind/)
  assert.throws(() => normalize([{ ...events[0], endMs: -1 }]), /time/)
  const absent = events.filter(event => event.eventKind !== 'fsync-count')
  assert.equal(normalize(absent).fsync.state, 'unmeasured')
  assert.throws(() => normalizeEvents(events, 1, { kind: 'product' }), /synthetic/)
})

import { expect, it } from 'vitest'
import { judgeArrivalEnvelope } from '@omne-harness-lite/arrival-events'
import {
  LosslessNumber,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { start, snapshot, closeOut } from '../src/operations.ts'
import { AssemblyState, recordSlot } from '../src/state.ts'
import { ownEvent } from '../src/values.ts'
import { transition } from '../src/transition.ts'
import { canonical, eventSources, expectedAt, json } from './helpers.ts'

function state(target: unknown): AssemblyState {
  const result = start(target)
  if ('rejected' in result) throw new Error('invalid fixture target')
  return result.ok
}
function nonClose(previous: AssemblyState, raw: unknown): AssemblyState {
  const data = AssemblyState.read(previous)
  const admitted = judgeArrivalEnvelope({ target: data.target, event: raw }, index => {
    const record = data.blocks[recordSlot(data.blocks, index)]
    return record !== undefined && !record.closed ? record.opened : undefined
  })
  if ('rejected' in admitted) throw new Error(`invalid legal fixture: ${admitted.rejected}`)
  const event = ownEvent(raw)
  if (event.t === 'close') throw new Error('non-close component test received a close')
  const result = transition(data, event)
  if ('rejected' in result) throw new Error(`sequence fixture rejected: ${result.rejected}`)
  return AssemblyState.create(result.ok)
}

it('STATE-01 independent starts have no target-open table and no content or ending', () => {
  const target = { kind: 'model_call', callId: 'mc', dispatch: new LosslessNumber('1e400') }
  const first = state(target)
  const second = state(target)
  expect(first).not.toBe(second)
  expect(canonical(snapshot(first))).toEqual(canonical({ blocks: [], position: 0 }))
  expect(closeOut(first)).toEqual({ rejected: 'stream_not_finished' })
  expect(Object.isFrozen(first)).toBe(true)
})

it('STATE-02 immutable non-close components reproduce frozen example 3 partial settlement', () => {
  const old = state({ kind: 'tool_execution', callId: 'call_9' })
  const events = eventSources('2.')
    .filter(artifact => artifact.line < 47)
    .slice(0, 7)
  expect(events).toHaveLength(7)
  let current = old
  for (const artifact of events) current = nonClose(current, json(artifact.json))
  const before = snapshot(current)
  expect(canonical(before)).toEqual(canonical(expectedAt(47)))
  current = nonClose(current, { t: 'finish', reason: 'interrupted' })
  const result = closeOut(current)
  if ('rejected' in result) throw new Error('finished partial fixture not settled')
  expect(canonical(result.ok)).toEqual(canonical(expectedAt(113)))
  expect(canonical(snapshot(old))).toEqual(canonical({ blocks: [], position: 0 }))
  expect(canonical(before)).toEqual(canonical(expectedAt(47)))
  expect(() => Reflect.set(before.blocks, '0', null)).not.toThrow()
  expect(Reflect.set(before.blocks, '0', null)).toBe(false)
  expect(() => Object.defineProperty(before.blocks[0], 'content', { value: 'mutated' })).toThrow()
})

it('STATE-03 sparse exact indices never become array slots and mathematical aliases reuse the record', () => {
  let current = state({ kind: 'model_call', callId: 'mc', dispatch: 1 })
  current = nonClose(current, {
    t: 'open',
    index: new LosslessNumber('9007199254740993'),
    kind: 'text',
    fill: 'append',
    id: 'b',
    visibility: { toHuman: true, toModel: true },
  })
  const old = snapshot(current)
  current = nonClose(current, {
    t: 'fill',
    index: new LosslessNumber('9007199254740993.0'),
    payload: 'payload',
  })
  expect(snapshot(current).blocks).toHaveLength(1)
  expect(
    recordSlot(AssemblyState.read(current).blocks, new LosslessNumber('9007199254740992')),
  ).toBe(-1)
  expect(writeJsonLossless(old)).not.toContain('payload')
  expect(writeJsonLossless(snapshot(current))).toContain('payload')
})

it('STATE-04 zero fills omit content while an accepted empty replace fill has content and settles empty', () => {
  let current = state({ kind: 'tool_execution', callId: 'c' })
  current = nonClose(current, {
    t: 'open',
    index: 0,
    kind: 'text',
    fill: 'replace',
    id: 'panel',
    visibility: { toHuman: true, toModel: false },
  })
  const zero = snapshot(current)
  expect(Object.hasOwn(zero.blocks[0] ?? {}, 'content')).toBe(false)
  current = nonClose(current, { t: 'fill', index: 0, payload: '' })
  const empty = snapshot(current)
  expect(Object.hasOwn(empty.blocks[0] ?? {}, 'content')).toBe(true)
  expect(Object.hasOwn(empty, 'firstContentAt')).toBe(false)
  current = nonClose(current, { t: 'finish', reason: 'end' })
  const result = closeOut(current)
  if ('rejected' in result) throw new Error('fixture not finished')
  expect(result.ok.blocks).toHaveLength(1)
  expect(result.ok.blocks[0]).toMatchObject({ kind: 'text', text: '' })
  expect(Object.hasOwn(zero.blocks[0] ?? {}, 'content')).toBe(false)
})

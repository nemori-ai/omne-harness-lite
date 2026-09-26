import { describe, expect, it } from 'vitest'
import { validate, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { acceptWithSealer } from '../src/accept.ts'
import { abandon } from '../src/abandon.ts'
import { incompleteToolCall, parseCollectedToolCall, type ToolOpening } from '../src/close.ts'
import { start, snapshot, closeOut } from '../src/operations.ts'
import type { AssemblyState } from '../src/state.ts'
import {
  canonical,
  eventSources,
  expectedAt,
  json,
  source,
  type SourceArtifact,
} from './helpers.ts'

function seal(opened: ToolOpening, raw: string, changed: boolean) {
  if (changed) return incompleteToolCall(opened, raw)
  if (!validate('ModelToolName', opened.head.tool).valid)
    throw new Error('normal-name fixture entered a deferred branch')
  return parseCollectedToolCall(opened, raw)
}
function initial(
  target: unknown = { kind: 'model_call', callId: 'mc_1', dispatch: 1 },
): AssemblyState {
  const result = start(target)
  if ('rejected' in result) throw new Error('invalid fixture target')
  return result.ok
}
function step(state: AssemblyState, raw: unknown): AssemblyState {
  const accepted = acceptWithSealer(state, raw, seal)
  if ('rejected' in accepted) throw new Error(`legal source rejected: ${accepted.rejected}`)
  return accepted.ok
}
function flow(
  target: unknown,
  artifacts: readonly SourceArtifact[],
  refusals: Readonly<Record<number, string>> = {},
): AssemblyState {
  let state = initial(target)
  for (const artifact of artifacts) {
    const previous = canonical(snapshot(state))
    const result = acceptWithSealer(state, json(artifact.json), seal)
    const expected = refusals[artifact.line]
    if (expected !== undefined) {
      expect(result, `source line ${artifact.line}`).toEqual({ rejected: expected })
      expect(canonical(snapshot(state))).toEqual(previous)
    } else {
      if ('rejected' in result)
        throw new Error(`source ${artifact.line} rejected: ${result.rejected}`)
      state = result.ok
    }
  }
  return state
}
function settle(state: AssemblyState) {
  const result = closeOut(state)
  if ('rejected' in result) throw new Error('source flow did not finish')
  return result.ok
}
const model = { kind: 'model_call', callId: 'mc_1', dispatch: 1 }
const tool = { kind: 'tool_execution', callId: 'call_9' }
const example2 = eventSources('2.').filter(artifact => artifact.line < 47)
const example4 = eventSources('12.', true)

describe('V-2/S-31–S-39 normal-name real module composition', () => {
  it('EX2/S31 reproduces all ten events, the position-seven snapshot and full settlement', () => {
    expect(example2).toHaveLength(10)
    const halfway = flow(tool, example2.slice(0, 7))
    expect(canonical(snapshot(halfway))).toEqual(canonical(expectedAt(47)))
    const completed = flow(tool, example2)
    expect(canonical(settle(completed))).toEqual(canonical(expectedAt(67)))
  })
  it('EX2-ONESHOT/S27 independently constructs the seven-event one-shot sequence', () => {
    const oneShotRows = eventSources('2.').filter(artifact => artifact.line > 90)
    expect(oneShotRows).toHaveLength(2)
    const refs = [
      example2[0],
      oneShotRows[0],
      example2[7],
      example2[2],
      example2[6],
      example2[8],
      oneShotRows[1],
    ]
    if (refs.some(item => item === undefined)) throw new Error('source refs missing')
    const artifacts = refs.filter(item => item !== undefined)
    const result = settle(flow(tool, artifacts))
    const split = settle(flow(tool, example2))
    expect(canonical(result.blocks)).toEqual(canonical(split.blocks))
    expect(result.ending.reason).toBe(split.ending.reason)
    expect(canonical(result.account)).not.toEqual(canonical(split.account))
  })
  it('EX3/S9 settles both open blocks from their actual delivered content', () => {
    let state = flow(tool, example2.slice(0, 7))
    state = step(state, { t: 'finish', reason: 'interrupted' })
    expect(canonical(settle(state))).toEqual(canonical(expectedAt(113)))
  })
  it('EX4/S10/S13 consumes all nine frozen AR events and preserves account and parsed arguments', () => {
    expect(example4).toHaveLength(9)
    const halfway = flow(model, example4.slice(0, 5))
    const view = snapshot(halfway)
    expect(view.blocks[1]).toMatchObject({ closed: false, content: '{"path": ' })
    expect(canonical(settle(flow(model, example4)))).toEqual(canonical(expectedAt(137)))
  })
  it('EX6/S35 user interruption keeps partial text and incomplete call with unknown account', () => {
    const result = settle(
      flow({ kind: 'model_call', callId: 'mc_2', dispatch: 1 }, eventSources('6.')),
    )
    expect(canonical(result)).toEqual(canonical(expectedAt(211)))
  })
  it('EX6-LOST/S22 abandon yields the same blocks/account without changing its prefix', () => {
    const old = flow(model, eventSources('6.').slice(0, 4))
    const before = canonical(snapshot(old))
    const abandoned = abandon(old)
    if ('rejected' in abandoned) throw new Error('fixture abandon rejected')
    const result = abandoned.ok
    const interrupted = settle(flow(model, eventSources('6.')))
    expect(canonical(result.blocks)).toEqual(canonical(interrupted.blocks))
    expect(canonical(result.account)).toEqual(canonical(interrupted.account))
    expect(result.ending.reason).toBe('lost')
    expect(Object.hasOwn(result.ending, 'error')).toBe(false)
    expect(canonical(snapshot(old))).toEqual(before)
    expect(closeOut(old)).toEqual({ rejected: 'stream_not_finished' })
  })
  it('EX7A/S32 accepts a bad-JSON close and stores the author’s unparseable call exactly', () => {
    const result = settle(flow(model, eventSources('7a')))
    expect(canonical(result.blocks[0])).toEqual(canonical(expectedAt(250)))
  })
  it('EX7B/S33 trim without an index keeps an otherwise valid argument stream incomplete', () => {
    const result = settle(flow(model, eventSources('7b'), { 262: 'malformed' }))
    expect(canonical(result.blocks[0])).toEqual(canonical(expectedAt(270)))
    if ('frames' in result.account) throw new Error('fixture account kind')
    expect(writeJsonLossless(result.account.trims.cut)).toBe('1')
    expect(canonical(result.account.trims.omittedBytes)).toEqual(canonical(7))
  })
  it('EX7B-MERGE/S12 safe merge does not make the accepted call incomplete', () => {
    const events = eventSources('7b')
    const merging = source('7b').find(artifact => artifact.line === 276)
    if (merging === undefined) throw new Error('merge source missing')
    const result = settle(
      flow(
        model,
        events.map(artifact => (artifact.line === 263 ? merging : artifact)),
        { 262: 'malformed' },
      ),
    )
    expect(result.blocks[0]).toMatchObject({ complete: true })
    expect(writeJsonLossless(result.blocks[0])).toContain('"arguments":{"path":"a.md"}')
  })
  it('EX7C/S39 matches the exact author frame account despite one refused late fill', () => {
    const result = settle(
      flow({ kind: 'tool_execution', callId: 'call_8' }, eventSources('7c'), {
        293: 'block_already_closed',
      }),
    )
    expect(canonical(result.account)).toEqual(canonical(expectedAt(300)))
  })
  it.each(source('7d'))(
    'EX7D/S10 raw source at $line is accepted at close without double rounding or duplicate-key repair',
    artifact => {
      const raw = json(artifact.json)
      if (typeof raw !== 'string') throw new Error('raw parameter text was not preserved')
      let state = initial(model)
      state = step(state, {
        t: 'open',
        index: 0,
        kind: 'tool_call',
        fill: 'append',
        id: 'call-block',
        visibility: { toHuman: true, toModel: true },
        head: { callId: 'call', tool: 'read_file' },
      })
      state = step(state, { t: 'fill', index: 0, payload: raw })
      state = step(state, { t: 'close', index: 0 })
      const sealed = snapshot(state).blocks[0]
      if (sealed === undefined || !sealed.closed || sealed.block.kind !== 'tool_call')
        throw new Error('close was not accepted')
      if (artifact.line === 319)
        expect(sealed.block).toMatchObject({ complete: true, unparseable: true, rawArguments: raw })
      else expect(writeJsonLossless(sealed.block)).toContain('"arguments":{"id":9007199254740993}')
    },
  )
  it('EX8/S16 empty replacements remain blocks while first-content history is independent of final content', () => {
    const events = eventSources('8.')
    const split = settle(flow({ kind: 'tool_execution', callId: 'call_6' }, events))
    expect(split.blocks[0]).toMatchObject({ kind: 'text', text: '' })
    expect(canonical(split.ending.firstContentAt)).toEqual(canonical(3))
    const first = events[0],
      empty = events[1],
      finish = events[4]
    if (first === undefined || empty === undefined || finish === undefined)
      throw new Error('source row missing')
    const one = settle(flow(tool, [first, empty, finish]))
    expect(canonical(one.blocks)).toEqual(canonical(split.blocks))
    expect(Object.hasOwn(one.ending, 'firstContentAt')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { judgeContentBlock, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { acceptWithSealer } from '../src/accept.ts'
import { incompleteToolCall, parseCollectedToolCall, type ToolOpening } from '../src/close.ts'
import { closeOut, snapshot, start } from '../src/operations.ts'
import type { AssemblyState } from '../src/state.ts'
import { canonical } from './helpers.ts'

function seal(opened: ToolOpening, raw: string, changed: boolean) {
  return changed ? incompleteToolCall(opened, raw) : parseCollectedToolCall(opened, raw)
}
function initial(): AssemblyState {
  const result = start({ kind: 'model_call', callId: 'mc_boundaries', dispatch: 1 })
  if ('rejected' in result) throw new Error('fixture start rejected')
  return result.ok
}
function step(state: AssemblyState, event: unknown): AssemblyState {
  const result = acceptWithSealer(state, event, seal)
  if ('rejected' in result) throw new Error(`fixture ${result.rejected}`)
  return result.ok
}
function settle(state: AssemblyState) {
  const result = closeOut(state)
  if ('rejected' in result) throw new Error('unfinished fixture')
  return result.ok
}
const visibility = { toHuman: true, toModel: true }
function opened(kind: string, fill: string = 'replace', index = 0) {
  return {
    t: 'open',
    index,
    kind,
    fill,
    id: `b_${index}`,
    visibility,
    ...(kind === 'voice'
      ? { head: { mediaType: 'audio/wav' } }
      : kind === 'tool_call'
        ? { head: { callId: `call_${index}`, tool: 'read_file' } }
        : {}),
  }
}

describe('S6/S9/S12/S16/S37 exact settlement and first-content boundaries', () => {
  it.each(['text', 'thinking', 'voice', 'image', 'file', 'tool_result'])(
    'SETTLE-NOFILL-%s opening without delivery remains in snapshot and is omitted at finish',
    kind => {
      const state = step(initial(), opened(kind))
      expect(snapshot(state).blocks).toHaveLength(1)
      expect(Object.hasOwn(snapshot(state).blocks[0] ?? {}, 'content')).toBe(false)
      const result = settle(step(state, { t: 'finish', reason: 'interrupted' }))
      expect(result.blocks).toEqual([])
      expect(Object.hasOwn(result.ending, 'firstContentAt')).toBe(false)
    },
  )
  it('SETTLE-NOFILL-CALL an open call with zero fills still settles incomplete and hidden', () => {
    const state = step(initial(), opened('tool_call'))
    const result = settle(step(state, { t: 'finish', reason: 'lost' }))
    expect(result.blocks).toEqual([
      {
        kind: 'tool_call',
        id: 'b_0',
        visibility: { toHuman: false, toModel: false },
        complete: false,
        callId: 'call_0',
        tool: 'read_file',
        rawArguments: '',
      },
    ])
    expect(Object.hasOwn(result.ending, 'firstContentAt')).toBe(false)
  })
  it.each(['text', 'thinking'])(
    'FIRST-CLOSE-%s only a nonempty zero-fill seal starts content',
    kind => {
      const state = step(initial(), opened(kind, 'append'))
      const close = (text: string) => ({
        t: 'close',
        index: 0,
        block: { kind, id: 'b_0', visibility, text },
      })
      const empty = step(state, close(''))
      expect(snapshot(empty).firstContentAt).toBeUndefined()
      const nonempty = step(state, close('spoken'))
      expect(canonical(snapshot(nonempty).firstContentAt)).toEqual(canonical(2))
      expect(snapshot(state).firstContentAt).toBeUndefined()
      const final = settle(step(nonempty, { t: 'finish', reason: 'end' }))
      expect(canonical(final.ending.firstContentAt)).toEqual(canonical(2))
    },
  )
  it('FIRST-CLOSE-EMPTY-FILL a delivered empty replacement prevents later close from being zero-fill content', () => {
    let state = step(initial(), opened('text'))
    state = step(state, { t: 'fill', index: 0, payload: '' })
    state = step(state, {
      t: 'close',
      index: 0,
      block: { kind: 'text', id: 'b_0', visibility, text: 'seal differs' },
    })
    const result = settle(step(state, { t: 'finish', reason: 'end' }))
    expect(result.blocks[0]).toMatchObject({ text: 'seal differs' })
    expect(Object.hasOwn(result.ending, 'firstContentAt')).toBe(false)
  })
  it('SETTLE-OPEN-ORDER reverse sealing retains open order and authoritative close bodies', () => {
    let state = step(initial(), opened('text', 'append', 8))
    state = step(state, opened('text', 'append', 80))
    state = step(state, { t: 'fill', index: 8, payload: 'partial A' })
    state = step(state, { t: 'fill', index: 80, payload: 'partial B' })
    for (const index of [80, 8])
      state = step(state, {
        t: 'close',
        index,
        block: { kind: 'text', id: `b_${index}`, visibility, text: `author seal ${index}` },
      })
    const result = settle(step(state, { t: 'finish', reason: 'end' }))
    expect(result.blocks.map(block => block.id)).toEqual(['b_8', 'b_80'])
    expect(result.blocks).toMatchObject([{ text: 'author seal 8' }, { text: 'author seal 80' }])
  })
  it.each(['frame_too_long', 'quota_exhausted', 'rejected'])(
    'TRIM-SCOPE-%s only open matching calls change; later trim cannot rewrite a sealed block',
    reason => {
      let state = step(initial(), opened('tool_call', 'append', 1))
      state = step(state, opened('tool_call', 'append', 2))
      for (const index of [1, 2]) state = step(state, { t: 'fill', index, payload: '{}' })
      state = step(state, { t: 'trim', index: 1, reason, omittedBytes: 1 })
      state = step(state, { t: 'close', index: 2 })
      const sealed = writeJsonLossless(snapshot(state).blocks[1])
      state = step(state, { t: 'trim', reason, omittedBytes: 1 })
      state = step(state, { t: 'close', index: 1 })
      expect(writeJsonLossless(snapshot(state).blocks[1])).toBe(sealed)
      const result = settle(step(state, { t: 'finish', reason: 'end' }))
      expect(result.blocks[0]).toMatchObject({ complete: false, rawArguments: '{}' })
      expect(result.blocks[1]).toMatchObject({ complete: true, arguments: {} })
      for (const block of result.blocks) expect('ok' in judgeContentBlock(block)).toBe(true)
    },
  )
  it('S37 finish-only tool stream has no blocks, no first content and a true zero frame account', () => {
    const started = start({ kind: 'tool_execution', callId: 'tc_none' })
    if ('rejected' in started) throw new Error('bad tool target')
    const result = settle(step(started.ok, { t: 'finish', reason: 'end' }))
    expect(result.blocks).toEqual([])
    expect(result.ending).toEqual({ reason: 'end' })
    expect(canonical(result.account)).toEqual(
      canonical({
        frames: {
          emitted: 0,
          trims: {
            merged: 0,
            cut: 0,
            omittedBytes: 0,
            byReason: { rate_merged: 0, frame_too_long: 0, quota_exhausted: 0, rejected: 0 },
          },
        },
      }),
    )
  })
})

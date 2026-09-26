import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@omne-harness-lite/content-blocks', async importOriginal => {
  const original = await importOriginal<typeof import('@omne-harness-lite/content-blocks')>()
  return { ...original, readJsonStrict: vi.fn(original.readJsonStrict) }
})
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { acceptWithSealer } from '../src/accept.ts'
import { incompleteToolCall, parseCollectedToolCall, type ToolOpening } from '../src/close.ts'
import { closeOut, snapshot, start } from '../src/operations.ts'
import type { AssemblyState } from '../src/state.ts'

function seal(opened: ToolOpening, raw: string, changed: boolean) {
  return changed ? incompleteToolCall(opened, raw) : parseCollectedToolCall(opened, raw)
}
function accepted(state: AssemblyState, event: unknown): AssemblyState {
  const result = acceptWithSealer(state, event, seal)
  if ('rejected' in result) throw new Error(`bad test prefix ${result.rejected}`)
  return result.ok
}
function filled(raw: string): AssemblyState {
  const result = start({ kind: 'model_call', callId: 'mc_SC1', dispatch: 1 })
  if ('rejected' in result) throw new Error('bad test target')
  let state = accepted(result.ok, {
    t: 'open',
    index: 0,
    kind: 'tool_call',
    fill: 'append',
    id: 'b_SC1',
    visibility: { toHuman: true, toModel: true },
    head: { callId: 'call_SC1', tool: 'read_file' },
  })
  if (raw !== '') state = accepted(state, { t: 'fill', index: 0, payload: raw })
  return state
}
function parameterReads(raw: string): number {
  // AR's strict envelope reader is a wire boundary, not a tool-parameter read.
  return vi.mocked(readJsonStrict).mock.calls.filter(([text]) => text === raw).length
}
beforeEach(() => vi.mocked(readJsonStrict).mockClear())

describe('SC-1 actual strict-reader call counts across the complete close lifecycle', () => {
  it.each(['{"SC1_value":9007199254740993}', '{"SC1_dup":1,"SC1_dup":2}', '{"SC1_broken":'])(
    'PARSE-ONCE-01 accepted close reads raw text %s exactly once',
    raw => {
      const open = filled(raw)
      snapshot(open)
      snapshot(open)
      closeOut(open)
      expect(parameterReads(raw)).toBe(0)
      const closed = accepted(open, { t: 'close', index: 0 })
      expect(parameterReads(raw)).toBe(1)
      const sealed = snapshot(closed)
      expect(sealed.blocks[0]).toHaveProperty('closed', true)
      snapshot(closed)
      closeOut(closed)
      expect(acceptWithSealer(closed, { t: 'close', index: 0 }, seal)).toEqual({
        rejected: 'block_already_closed',
      })
      const finished = accepted(closed, { t: 'finish', reason: 'end' })
      const first = closeOut(finished),
        second = closeOut(finished)
      expect(writeJsonLossless(first)).toBe(writeJsonLossless(second))
      expect(parameterReads(raw)).toBe(1)
    },
  )
  it('PARSE-ONCE-02 empty raw text invokes the one reader once with an empty object', () => {
    const open = filled('')
    expect(parameterReads('{}')).toBe(0)
    const closed = accepted(open, { t: 'close', index: 0 })
    snapshot(closed)
    closeOut(accepted(closed, { t: 'finish', reason: 'end' }))
    expect(parameterReads('{}')).toBe(1)
  })
  it('PARSE-ZERO-01 a changed-content trim bypasses reading even valid JSON', () => {
    const raw = '{"SC1_trim":"would parse"}'
    let state = filled(raw)
    state = accepted(state, { t: 'trim', reason: 'rejected', omittedBytes: 1 })
    state = accepted(state, { t: 'close', index: 0 })
    state = accepted(state, { t: 'finish', reason: 'end' })
    closeOut(state)
    snapshot(state)
    expect(parameterReads(raw)).toBe(0)
  })
  it('PARSE-ZERO-02 unfinished calls and refused close paths never read arguments', () => {
    const raw = '{"SC1_partial":"content"}'
    const open = filled(raw)
    const before = writeJsonLossless(snapshot(open))
    expect(
      acceptWithSealer(
        open,
        {
          t: 'close',
          index: 0,
          block: {
            kind: 'text',
            id: 'b_SC1',
            visibility: { toHuman: true, toModel: true },
            text: '',
          },
        },
        seal,
      ),
    ).toEqual({ rejected: 'payload_kind_mismatch' })
    expect(writeJsonLossless(snapshot(open))).toBe(before)
    const finished = accepted(open, { t: 'finish', reason: 'lost' })
    closeOut(finished)
    snapshot(finished)
    expect(parameterReads(raw)).toBe(0)
  })
})

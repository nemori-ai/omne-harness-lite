import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@omne-harness-lite/content-blocks', async importOriginal => {
  const original = await importOriginal<typeof import('@omne-harness-lite/content-blocks')>()
  return { ...original, readJsonStrict: vi.fn(original.readJsonStrict) }
})
import {
  judgeContentBlock,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { accept } from '../src/index.ts'
import { closeOut, snapshot, start } from '../src/operations.ts'
import type { AssemblyState } from '../src/state.ts'
import { canonical, json, source } from './helpers.ts'

function accepted(state: AssemblyState, event: unknown): AssemblyState {
  const result = accept(state, event)
  if ('rejected' in result) throw new Error(`bad test prefix ${result.rejected}`)
  return result.ok
}
function filled(raw: string, tool = 'read_file', id = 'b_SC1', callId = 'call_SC1'): AssemblyState {
  if (tool === 'read_file' || tool === 'x'.repeat(128))
    expect(
      judgeContentBlock({
        kind: 'tool_call',
        id,
        callId,
        tool,
        complete: true,
        visibility: { toHuman: true, toModel: true },
        arguments: {},
      }),
    ).toHaveProperty('ok')
  const result = start({ kind: 'model_call', callId: 'mc_SC1', dispatch: 1 })
  if ('rejected' in result) throw new Error('bad test target')
  let state = accepted(result.ok, {
    t: 'open',
    index: 0,
    kind: 'tool_call',
    fill: 'append',
    id,
    visibility: { toHuman: true, toModel: true },
    head: { callId, tool },
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
  it.each(source('10.', 'json-block'))(
    'EX10/NAME-PARSE source $line preserves the exact CB3 block and actual parse boundary',
    artifact => {
      const expected = json(artifact.json)
      if (
        expected === null ||
        typeof expected !== 'object' ||
        Array.isArray(expected) ||
        !('tool' in expected) ||
        typeof expected.tool !== 'string'
      )
        throw new Error('bad source name case')
      expect(judgeContentBlock(expected)).toHaveProperty('ok')
      const open = filled('{}', expected.tool, 'b_name', 'call_name')
      snapshot(open)
      expect(parameterReads('{}')).toBe(0)
      const closed = accepted(open, { t: 'close', index: 0 })
      const item = snapshot(closed).blocks[0]
      if (item === undefined || !item.closed) throw new Error('name close was not accepted')
      expect(canonical(item.block)).toEqual(canonical(expected))
      expect(judgeContentBlock(item.block)).toHaveProperty('ok')
      const reads = Object.hasOwn(expected, 'unparseable') ? 0 : 1
      expect(parameterReads('{}')).toBe(reads)
      expect(accept(closed, { t: 'close', index: 0 })).toEqual({ rejected: 'block_already_closed' })
      const finished = accepted(closed, { t: 'finish', reason: 'end' })
      for (let index = 0; index < 3; index++) {
        snapshot(finished)
        const result = closeOut(finished)
        if ('rejected' in result) throw new Error('name case not finished')
        expect(canonical(result.ok.blocks[0])).toEqual(canonical(expected))
      }
      expect(parameterReads('{}')).toBe(reads)
    },
  )
  it.each(['bad:name', 'x'.repeat(129), '工具', 'a/b'])(
    'NAME-ZERO raw empty bad name %s is not replaced by an empty object',
    tool => {
      const closed = accepted(filled('', tool), { t: 'close', index: 0 })
      expect(snapshot(closed).blocks[0]).toMatchObject({
        closed: true,
        block: {
          tool,
          complete: true,
          rawArguments: '',
          unparseable: true,
        },
      })
      expect(parameterReads('{}')).toBe(0)
    },
  )
  it.each(['bad:name', 'x'.repeat(129), 'read_file'])(
    'NAME-TRIM changed content %s wins before name classification',
    tool => {
      let state = filled('{"SC1_name_trim":true}', tool)
      state = accepted(state, { t: 'trim', reason: 'frame_too_long', omittedBytes: 2 })
      state = accepted(state, { t: 'close', index: 0 })
      const item = snapshot(state).blocks[0]
      expect(item).toMatchObject({
        closed: true,
        block: {
          tool,
          complete: false,
          rawArguments: '{"SC1_name_trim":true}',
          visibility: { toHuman: false, toModel: false },
        },
      })
      if (item === undefined || !item.closed) throw new Error('trim case did not close')
      expect(judgeContentBlock(item.block)).toHaveProperty('ok')
      expect(Object.hasOwn(item.block, 'unparseable')).toBe(false)
      expect(parameterReads('{"SC1_name_trim":true}')).toBe(0)
    },
  )
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
      expect(accept(closed, { t: 'close', index: 0 })).toEqual({
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
      accept(open, {
        t: 'close',
        index: 0,
        block: {
          kind: 'text',
          id: 'b_SC1',
          visibility: { toHuman: true, toModel: true },
          text: '',
        },
      }),
    ).toEqual({ rejected: 'payload_kind_mismatch' })
    expect(writeJsonLossless(snapshot(open))).toBe(before)
    const finished = accepted(open, { t: 'finish', reason: 'lost' })
    closeOut(finished)
    snapshot(finished)
    expect(parameterReads(raw)).toBe(0)
  })
})

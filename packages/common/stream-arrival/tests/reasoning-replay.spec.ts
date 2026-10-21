import { describe, expect, it } from 'vitest'
import { parseMessageId, type Message } from '@omne-harness/message'
import { assembleStream, type AssembleResult } from '@omne-harness/stream-arrival'

const id = 'msg_abcdefghijklmnopqrstuv'
const modelOnly = { toHuman: false, toModel: true }
const shown = { toHuman: true, toModel: true }

const replay = { scope: 'provider-x', format: 'v1' }
const finish = { step: 'finish', index: '9' }
const finishWithReplay = { ...finish, replay }

const thinkingHead = { kind: 'thinking', id: 'th1', visibility: shown }
const stateHead = { kind: 'reasoning_state', id: 'rs1', visibility: modelOnly }
const stateBlock = { ...stateHead, payload: 'opaque-1', pairs: ['th1'] }
const callHead = { kind: 'tool_call', id: 'k1', visibility: shown, callId: 'c1', name: 'echo' }
const callBlock = {
  ...callHead,
  arguments: { kind: 'object', entries: [{ key: 'a', value: { kind: 'null' } }] },
}

function target(role: 'assistant' | 'tool' = 'assistant') {
  const parsed = parseMessageId(id)
  if (!parsed.ok) throw new Error('id')
  return { id: parsed.value, role }
}

function run(steps: readonly unknown[]): AssembleResult {
  return assembleStream({ target: target(), steps })
}

function rejection(result: AssembleResult): string | undefined {
  if (!('rejected' in result)) return undefined
  return result.detail === undefined ? result.rejected : `${result.rejected}:${result.detail}`
}

function openState(index: string, head: unknown = stateHead) {
  return { step: 'open', index, mode: 'replace', head }
}

function closeState(index: string, block: unknown = stateBlock) {
  return { step: 'close', index, block }
}

function openThinking(index: string) {
  return { step: 'open', index, mode: 'append', head: thinkingHead }
}

/** The thinking block with the text `why`, from open to close. */
function thinking(index: string): unknown[] {
  return [
    openThinking(index),
    { step: 'fill', index, seq: '0', chunk: 'why' },
    { step: 'close', index },
  ]
}

function completed(result: AssembleResult): Message {
  if (!('ok' in result) || result.ok.phase !== 'ended') throw new Error('not ended')
  const { terminal } = result.ok
  if (terminal.kind !== 'complete') throw new Error(terminal.kind)
  return terminal.message
}

describe('a reasoning_state part arrives whole', () => {
  it('finishes into a message whose replay.at is the position of the part', () => {
    const message = completed(
      run([...thinking('0'), openState('1'), closeState('1'), finishWithReplay]),
    )
    expect(message).toEqual({
      id,
      role: 'assistant',
      blocks: [{ kind: 'thinking', id: 'th1', visibility: shown, text: 'why' }, stateBlock],
      replay: { scope: 'provider-x', format: 'v1', at: [1] },
    })
  })

  it('writes every position when states interleave with thinking and a call', () => {
    const second = { ...stateHead, id: 'rs2', payload: 'opaque-2', pairs: ['k1'] }
    const message = completed(
      run([
        openState('0'),
        closeState('0', { ...stateBlock, pairs: [] }),
        ...thinking('1'),
        { step: 'open', index: '2', mode: 'append', head: callHead },
        { step: 'fill', index: '2', seq: '0', chunk: '{"a":null}' },
        { step: 'close', index: '2', block: callBlock },
        openState('3', { ...stateHead, id: 'rs2' }),
        closeState('3', second),
        finishWithReplay,
      ]),
    )
    expect('replay' in message && message.replay).toEqual({ ...replay, at: [0, 3] })
    expect(message.blocks.map(block => block.kind)).toEqual([
      'reasoning_state',
      'thinking',
      'tool_call',
      'reasoning_state',
    ])
  })

  it('counts the position among sealed parts, so the gaps in step indexes do not matter', () => {
    const message = completed(
      run([
        ...thinking('4'),
        openState('8'),
        closeState('8', { ...stateBlock, pairs: [] }),
        { ...finishWithReplay, index: '20' },
      ]),
    )
    expect('replay' in message && message.replay).toEqual({ ...replay, at: [1] })
  })

  it('has no append form', () => {
    expect(rejection(run([{ ...openState('0'), mode: 'append' }]))).toBe('mode')
  })

  it('refuses a fill between the open and the close', () => {
    const result = run([openState('0'), { step: 'fill', index: '0', seq: '0', chunk: 'x' }])
    expect(rejection(result)).toBe('mode')
  })

  it('refuses a close without the part, and names the missing payload', () => {
    expect(rejection(run([openState('0'), { step: 'close', index: '0' }]))).toBe('block:payload')
  })

  it('refuses a part that is not valid, with the rejection of judgePart', () => {
    const shownState = { ...stateBlock, visibility: shown }
    expect(rejection(run([openState('0'), closeState('0', shownState)]))).toBe('block:visibility')
    expect(rejection(run([openState('0'), closeState('0', { ...stateBlock, payload: '' })]))).toBe(
      'block:payload',
    )
  })

  it('refuses a head that has a key of another kind', () => {
    const head = { ...stateHead, payload: 'x' }
    expect(rejection(run([openState('0', head)]))).toBe('step:extra')
  })

  it('refuses a part whose identity or visibility differs from the head', () => {
    expect(rejection(run([openState('0'), closeState('0', { ...stateBlock, id: 'other' })]))).toBe(
      'conflict',
    )
    const hidden = { ...stateBlock, visibility: { toHuman: false, toModel: false } }
    expect(rejection(run([openState('0'), closeState('0', hidden)]))).toBe('conflict')
  })

  it('refuses a part of another kind on a reasoning_state head', () => {
    const block = { kind: 'text', id: 'rs1', visibility: modelOnly, text: '' }
    expect(rejection(run([openState('0'), closeState('0', block)]))).toBe('conflict')
  })

  it('refuses a replay when the target is not an assistant message', () => {
    const result = assembleStream({
      target: target('tool'),
      steps: [openState('0'), closeState('0'), finishWithReplay],
    })
    expect(rejection(result)).toBe('block:extra')
  })

  it('refuses a pair that names no block of the message', () => {
    const result = run([openState('0'), closeState('0'), finishWithReplay])
    expect(rejection(result)).toBe('block:pairs')
  })

  it('keeps the previous assembly when a step is refused', () => {
    const result = run([openState('0'), { step: 'fill', index: '0', seq: '0', chunk: 'x' }])
    expect(result).toMatchObject({ rejected: 'mode', at: 1, assembly: { phase: 'live' } })
  })
})

describe('finish and the replay of a message', () => {
  const withState = [...thinking('0'), openState('1'), closeState('1')]

  it('refuses a message that has a state part when finish brings no replay', () => {
    expect(rejection(run([...withState, finish]))).toBe('block:replay')
  })

  it('takes a thinking-only message with a replay, and `at` is empty', () => {
    const message = completed(run([...thinking('0'), finishWithReplay]))
    expect(message).toEqual({
      id,
      role: 'assistant',
      blocks: [{ kind: 'thinking', id: 'th1', visibility: shown, text: 'why' }],
      replay: { ...replay, at: [] },
    })
  })

  it('takes a thinking-only message without a replay, and the message has no replay key', () => {
    const message = completed(run([...thinking('0'), finish]))
    expect(message).toEqual({
      id,
      role: 'assistant',
      blocks: [{ kind: 'thinking', id: 'th1', visibility: shown, text: 'why' }],
    })
    expect('replay' in message).toBe(false)
  })

  it('refuses a replay on a message that has neither thinking nor a state part', () => {
    const text = [
      {
        step: 'open',
        index: '0',
        mode: 'append',
        head: { kind: 'text', id: 't', visibility: shown },
      },
      { step: 'fill', index: '0', seq: '0', chunk: 'hi' },
      { step: 'close', index: '0' },
    ]
    expect(rejection(run([...text, finishWithReplay]))).toBe('block:replay')
  })

  it('refuses an empty scope or format when the message is made', () => {
    const steps = [...thinking('0')]
    expect(rejection(run([...steps, { ...finish, replay: { ...replay, scope: '' } }]))).toBe(
      'block:replay',
    )
    expect(rejection(run([...steps, { ...finish, replay: { ...replay, format: '' } }]))).toBe(
      'block:replay',
    )
  })

  it('refuses a replay whose shape is wrong', () => {
    const bad: unknown[] = [
      null,
      undefined,
      'provider-x',
      ['provider-x', 'v1'],
      { scope: 'provider-x' },
      { format: 'v1' },
      { ...replay, at: [] },
      { ...replay, extra: 'x' },
      { scope: 1, format: 'v1' },
      { scope: 'provider-x', format: null },
      Object.create({ scope: 'provider-x', format: 'v1' }) as unknown,
    ]
    for (const value of bad) {
      const result = run([...withState, { ...finish, replay: value }])
      expect(result, String(JSON.stringify(value))).toMatchObject({
        rejected: 'step',
        detail: 'replay',
        at: withState.length,
      })
    }
  })

  it('refuses a replay with an accessor, and does not call it', () => {
    let calls = 0
    const hostile = { format: 'v1' }
    Object.defineProperty(hostile, 'scope', {
      enumerable: true,
      get() {
        calls += 1
        return 'provider-x'
      },
    })
    expect(rejection(run([...withState, { ...finish, replay: hostile }]))).toBe('step:replay')
    expect(calls).toBe(0)
  })

  it('does not take the replay of the caller object by reference', () => {
    const mutable = { ...replay }
    const result = run([...withState, { ...finish, replay: mutable }])
    mutable.scope = 'changed'
    expect(completed(result)).toMatchObject({ replay: { scope: 'provider-x' } })
  })

  it('takes the same finish again as a no-op, and refuses a different replay as conflict', () => {
    const first = run([...withState, finishWithReplay])
    if (!('ok' in first)) throw new Error('first')
    const again = assembleStream({ target: target(), from: first.ok, steps: [finishWithReplay] })
    expect(again).toEqual(first)
    const other = { ...finish, replay: { ...replay, format: 'v2' } }
    expect(rejection(assembleStream({ target: target(), from: first.ok, steps: [other] }))).toBe(
      'conflict',
    )
    expect(rejection(run([...withState, finishWithReplay, other]))).toBe('conflict')
  })

  it('refuses a finish without replay after one that had it, as conflict', () => {
    expect(rejection(run([...withState, finishWithReplay, finish]))).toBe('conflict')
  })

  it('gives the sealed state part and no message or replay when the end is stopped', () => {
    const result = assembleStream({
      target: target(),
      steps: [...withState],
      end: { kind: 'stopped' },
    })
    if (!('ok' in result) || result.ok.phase !== 'ended') throw new Error('not ended')
    const { terminal } = result.ok
    if (terminal.kind !== 'truncated') throw new Error(terminal.kind)
    expect(terminal.blocks.map(block => block.kind)).toEqual(['thinking', 'reasoning_state'])
    expect('message' in terminal).toBe(false)
    expect('replay' in terminal).toBe(false)
  })
})

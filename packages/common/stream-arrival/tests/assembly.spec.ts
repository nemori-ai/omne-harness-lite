import { expect, it } from 'vitest'
import { judgeMessage, parseMessageId } from '@omne-harness/message'
import {
  assembleStream,
  type AssembleResult,
  type StreamAssembly,
} from '@omne-harness/stream-arrival'

const id = 'msg_abcdefghijklmnopqrstuv'
const visibility = { toHuman: true, toModel: true }
const text = 'hello'
const head = { kind: 'text', id: 'b1', visibility }
const open = { step: 'open', index: '0', mode: 'append', head }
const fill0 = { step: 'fill', index: '0', seq: '0', chunk: text }
const fill1 = { step: 'fill', index: '0', seq: '1', chunk: text }
const close = { step: 'close', index: '0' }
const finish = { step: 'finish', index: '0' }
const steps = [open, fill0, fill1, close, finish]
const block = { kind: 'text', id: 'b1', visibility, text: `${text}${text}` }
const oneFill = { kind: 'text', id: 'b1', visibility, text }

function target() {
  const parsed = parseMessageId(id)
  if (!parsed.ok) throw new Error('id')
  return { id: parsed.value, role: 'assistant' as const }
}

function ended(result: AssembleResult): Extract<StreamAssembly, { phase: 'ended' }> {
  if (!('ok' in result) || result.ok.phase !== 'ended') throw new Error('expected ended')
  return result.ok
}

it('S1 concatenates two fills that carry the same text', () => {
  expect(assembleStream({ target: target(), steps })).toEqual({
    ok: {
      phase: 'ended',
      terminal: {
        kind: 'complete',
        message: { id, role: 'assistant', blocks: [block] },
        trims: [],
      },
    },
  })
})

it('S2 does not double the text when assembleStream receives the same steps again', () => {
  const first = assembleStream({ target: target(), steps })
  const second = assembleStream({ target: target(), from: ended(first), steps })
  expect(second).toEqual(first)
  const duplicated = assembleStream({
    target: target(),
    steps: [open, fill0, fill0, fill1, close, finish],
  })
  expect(duplicated).toEqual(first)
})

it('S3 rejects finish while a block is open', () => {
  expect(assembleStream({ target: target(), steps: [open, fill0, finish] })).toEqual({
    rejected: 'open',
    at: 2,
    assembly: { phase: 'live' },
  })
})

it('S4 is truncated and is not a value judgeMessage accepts', () => {
  const result = assembleStream({
    target: target(),
    steps: [open, fill0, close],
    end: { kind: 'stopped' },
  })
  const terminal = ended(result).terminal
  expect(terminal).toEqual({ kind: 'truncated', blocks: [oneFill], trims: [] })
  expect(judgeMessage(terminal)).toEqual({ rejected: 'extra' })
})

it('S5 returns late and leaves the first message unchanged', () => {
  const first = assembleStream({ target: target(), steps })
  const late = assembleStream({
    target: target(),
    from: ended(first),
    steps: [{ step: 'open', index: '1', mode: 'append', head: { ...head, id: 'b2' } }],
  })
  expect(late).toEqual({ rejected: 'late', at: 0, assembly: ended(first) })
  if (!('rejected' in late)) throw new Error('expected late')
  expect(late.assembly).toBe(ended(first))
})

it('S6 has no observer end marker, then finish, one complete', () => {
  expect(steps.some(step => Object.hasOwn(step, 'end'))).toBe(false)
  const once = assembleStream({ target: target(), steps })
  expect(ended(once).terminal).toEqual({
    kind: 'complete',
    message: { id, role: 'assistant', blocks: [block] },
    trims: [],
  })
  const again = assembleStream({ target: target(), from: ended(once), steps })
  expect(again).toEqual(once)
})

it('S7 uses end { kind: cancelled } and is not a complete message', () => {
  const result = assembleStream({
    target: target(),
    steps: [open, fill0, close],
    end: { kind: 'cancelled' },
  })
  const terminal = ended(result).terminal
  expect(terminal).toEqual({ kind: 'cancelled', blocks: [oneFill], trims: [] })
  expect(judgeMessage(terminal)).toEqual({ rejected: 'extra' })
})

it('S8 rejects a second open of the same index with a different head', () => {
  expect(
    assembleStream({
      target: target(),
      steps: [
        { step: 'open', index: '1', mode: 'append', head },
        { step: 'open', index: '1', mode: 'append', head: { ...head, id: 'b2' } },
      ],
    }),
  ).toEqual({ rejected: 'index', at: 1, assembly: { phase: 'live' } })
})

it('S9 rejects an image opened as append', () => {
  expect(
    assembleStream({
      target: target(),
      steps: [
        {
          step: 'open',
          index: '0',
          mode: 'append',
          head: { kind: 'image', id: 'b4', visibility, mediaType: 'image/png' },
        },
      ],
    }),
  ).toEqual({ rejected: 'mode', at: 0, assembly: { phase: 'live' } })
})

it('S10 equals the one-shot message blocks', () => {
  const streamed = ended(assembleStream({ target: target(), steps }))
  const oneShot = judgeMessage({ id, role: 'assistant', blocks: [block] })
  if (streamed.terminal.kind !== 'complete' || !('ok' in oneShot))
    throw new Error('expected complete')
  expect(streamed.terminal.message).toEqual(oneShot.ok)
})

it('trim keeps the closed part and records removed and reason', () => {
  expect(
    assembleStream({
      target: target(),
      steps: [
        open,
        fill0,
        close,
        { step: 'trim', index: '0', removed: '2', reason: 'budget' },
        finish,
      ],
    }),
  ).toEqual({
    ok: {
      phase: 'ended',
      terminal: {
        kind: 'complete',
        message: { id, role: 'assistant', blocks: [oneFill] },
        trims: [{ index: '0', removed: '2', reason: 'budget' }],
      },
    },
  })
})

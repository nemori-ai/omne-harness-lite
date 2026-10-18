import { expect, it } from 'vitest'
import { parseMessageId } from '@omne-harness/message'
import { assembleStream, type AssembleResult } from '@omne-harness/stream-arrival'

const id = 'msg_abcdefghijklmnopqrstuv'
const visibility = { toHuman: true, toModel: true }
const textHead = { kind: 'text', id: 'b1', visibility }
const openText = { step: 'open', index: '0', mode: 'append', head: textHead }
const live = { phase: 'live' }

function target(role: 'assistant' | 'tool' = 'assistant') {
  const parsed = parseMessageId(id)
  if (!parsed.ok) throw new Error('id')
  return { id: parsed.value, role }
}

function run(steps: readonly unknown[], role?: 'assistant' | 'tool'): AssembleResult {
  return assembleStream({ target: target(role), steps })
}

it('refuses a head with a non-enumerable own key as json', () => {
  const head = { ...textHead }
  Object.defineProperty(head, 'secret', { value: 'x', enumerable: false })
  expect(run([{ ...openText, head }])).toEqual({
    rejected: 'step',
    detail: 'json',
    at: 0,
    assembly: live,
  })
})

it('refuses a tool_result head without callId, and names callId', () => {
  const head = { kind: 'tool_result', id: 'r1', visibility }
  expect(run([{ step: 'open', index: '0', mode: 'replace', head }], 'tool')).toEqual({
    rejected: 'step',
    detail: 'callId',
    at: 0,
    assembly: live,
  })
})

it('takes a voice head without mediaType', () => {
  const head = { kind: 'voice', id: 'm1', visibility }
  expect(run([{ step: 'open', index: '0', mode: 'append', head }])).toEqual({ ok: live })
})

it('takes an image head without mediaType', () => {
  const head = { kind: 'image', id: 'm1', visibility }
  expect(run([{ step: 'open', index: '0', mode: 'replace', head }])).toEqual({ ok: live })
})

it('seals an image opened without mediaType with a block that carries one', () => {
  const head = { kind: 'image', id: 'i1', visibility }
  const image = { ...head, mediaType: 'image/png', inline: 'png' }
  const ended = run([
    { step: 'open', index: '0', mode: 'replace', head },
    { step: 'fill', index: '0', seq: '0', chunk: 'png' },
    { step: 'close', index: '0', block: image },
    { step: 'finish', index: '0' },
  ])
  expect(ended).toEqual({
    ok: {
      phase: 'ended',
      terminal: {
        kind: 'complete',
        message: { id, role: 'assistant', blocks: [image] },
        trims: [],
      },
    },
  })
})

it('seals a file opened without storage, key, and mediaType with a whole file block', () => {
  const head = { kind: 'file', id: 'f1', visibility }
  const file = { ...head, storage: 'local', key: 'k1', mediaType: 'text/plain' }
  const ended = run([
    { step: 'open', index: '0', mode: 'replace', head },
    { step: 'close', index: '0', block: file },
    { step: 'finish', index: '0' },
  ])
  expect(ended).toEqual({
    ok: {
      phase: 'ended',
      terminal: { kind: 'complete', message: { id, role: 'assistant', blocks: [file] }, trims: [] },
    },
  })
})

it('refuses the block before the head when an image opened with mediaType closes with a block that lacks one', () => {
  const head = { kind: 'image', id: 'i1', visibility, mediaType: 'image/png' }
  const image = { kind: 'image', id: 'i1', visibility, inline: 'png' }
  expect(
    run([
      { step: 'open', index: '0', mode: 'replace', head },
      { step: 'fill', index: '0', seq: '0', chunk: 'png' },
      { step: 'close', index: '0', block: image },
    ]),
  ).toEqual({ rejected: 'block', detail: 'media', at: 2, assembly: live })
})

it('is a conflict when a trimmed tool_call closes with a text block, not a trimmed block', () => {
  const head = { kind: 'tool_call', id: 'b1', visibility, callId: 'c1', name: 'echo' }
  const text = { kind: 'text', id: 'b1', visibility, text: 'abc' }
  expect(
    run([
      { step: 'open', index: '0', mode: 'append', head },
      { step: 'fill', index: '0', seq: '0', chunk: 'abc' },
      { step: 'trim', index: '0', removed: '1', reason: 'budget' },
      { step: 'close', index: '0', block: text },
    ]),
  ).toEqual({ rejected: 'conflict', at: 3, assembly: live })
})

it('refuses a head that reports an own key without a descriptor as json, and does not throw', () => {
  const head = new Proxy(
    { ...textHead },
    {
      ownKeys: value => [...Reflect.ownKeys(value), 'ghost'],
      getOwnPropertyDescriptor: (value, key) =>
        key === 'ghost' ? undefined : Reflect.getOwnPropertyDescriptor(value, key),
    },
  )
  expect(run([{ ...openText, head }])).toEqual({
    rejected: 'step',
    detail: 'json',
    at: 0,
    assembly: live,
  })
})

it('is a conflict when a text head closes with a tool_call_unparsed whose raw equals the text', () => {
  const unparsed = {
    kind: 'tool_call_unparsed',
    id: 'b1',
    visibility,
    callId: 'c1',
    name: 'echo',
    raw: 'abc',
  }
  expect(
    run([
      openText,
      { step: 'fill', index: '0', seq: '0', chunk: 'abc' },
      { step: 'close', index: '0', block: unparsed },
    ]),
  ).toEqual({ rejected: 'conflict', at: 2, assembly: live })
})

it('refuses a trim on an index that was never opened as unopened', () => {
  const trim = { step: 'trim', index: '0', removed: '1', reason: 'budget' }
  expect(run([trim])).toEqual({ rejected: 'unopened', at: 0, assembly: live })
})

it('refuses a trim on an index above the open ones as unopened, and keeps the prior assembly', () => {
  const opened = run([openText])
  if (!('ok' in opened)) throw new Error('expected live')
  const trimmed = assembleStream({
    target: target(),
    from: opened.ok,
    steps: [{ step: 'trim', index: '3', removed: '1', reason: 'budget' }],
  })
  expect(trimmed).toEqual({ rejected: 'unopened', at: 0, assembly: opened.ok })
  if (!('rejected' in trimmed)) throw new Error('expected unopened')
  expect(trimmed.assembly).toBe(opened.ok)
})

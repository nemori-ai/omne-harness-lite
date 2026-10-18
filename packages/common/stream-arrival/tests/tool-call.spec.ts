import { describe, expect, it } from 'vitest'
import { CONTENT_BLOCK_HEAD_KEYS } from '@omne-harness/content-block'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { parseMessageId } from '@omne-harness/message'
import {
  assembleStream,
  type AssembleResult,
  type StreamAssembly,
} from '@omne-harness/stream-arrival'

const id = 'msg_abcdefghijklmnopqrstuv'
const visibility = { toHuman: true, toModel: true }

const callHead = { kind: 'tool_call', id: 'k1', visibility, callId: 'c1', name: 'echo' }
const args: JsonValue = { kind: 'object', entries: [{ key: 'a', value: { kind: 'null' } }] }
const callBlock = { ...callHead, arguments: args }
const openCall = { step: 'open', index: '0', mode: 'append', head: callHead }
const fillCall = { step: 'fill', index: '0', seq: '0', chunk: '{"a":null}' }
const finish = { step: 'finish', index: '9' }

function target(role: 'assistant' | 'tool' = 'assistant') {
  const parsed = parseMessageId(id)
  if (!parsed.ok) throw new Error('id')
  return { id: parsed.value, role }
}

function run(steps: readonly unknown[], end?: { kind: 'stopped' }): AssembleResult {
  return assembleStream({ target: target(), steps, ...(end === undefined ? {} : { end }) })
}

function close(block: unknown, index = '0') {
  return { step: 'close', index, block }
}

function rejection(result: AssembleResult): string | undefined {
  if (!('rejected' in result)) return undefined
  return result.detail === undefined ? result.rejected : `${result.rejected}:${result.detail}`
}

function deep(levels: number): unknown {
  let value: unknown = 1
  for (let level = 0; level < levels; level += 1) value = { next: value }
  return value
}

describe('a tool_call closes only with an explicit complete block', () => {
  it('seals an explicit complete tool_call and finishes a message that holds it', () => {
    const result = run([openCall, fillCall, close(callBlock), finish])
    expect(result).toEqual({
      ok: {
        phase: 'ended',
        terminal: {
          kind: 'complete',
          message: { id, role: 'assistant', blocks: [callBlock] },
          trims: [],
        },
      },
    })
  })

  it('refuses the implicit close and names the field the part judge refused', () => {
    expect(rejection(run([openCall, fillCall, { step: 'close', index: '0' }]))).toBe(
      'block:arguments',
    )
    const emptyName = { ...openCall, head: { ...callHead, name: '' } }
    expect(rejection(run([emptyName, fillCall, { step: 'close', index: '0' }]))).toBe('block:name')
  })

  it('keeps the prior assembly when the implicit close is refused', () => {
    const opened = run([openCall, fillCall])
    if (!('ok' in opened)) throw new Error('expected live')
    const refused = assembleStream({
      target: target(),
      from: opened.ok,
      steps: [{ step: 'close', index: '0' }],
    })
    expect(refused).toEqual({ rejected: 'block', detail: 'arguments', at: 0, assembly: opened.ok })
    if (!('rejected' in refused)) throw new Error('expected refused')
    expect(refused.assembly).toBe(opened.ok)
  })

  it('refuses a head that already carries arguments', () => {
    const head = { ...callHead, arguments: '{}' }
    expect(rejection(run([{ ...openCall, head }]))).toBe('step:extra')
  })

  it('gives tool_result no append form', () => {
    const head = { kind: 'tool_result', id: 'r1', visibility, callId: 'c1' }
    expect(rejection(run([{ step: 'open', index: '0', mode: 'append', head }]))).toBe('mode')
  })

  it('takes a tool_result head with exactly its four keys, and closes it as the marker', () => {
    const head = { kind: 'tool_result', id: 'r1', visibility, callId: 'c1' }
    const result = assembleStream({
      target: target('tool'),
      steps: [
        { step: 'open', index: '0', mode: 'replace', head },
        { step: 'close', index: '0' },
        finish,
      ],
    })
    expect(result).toEqual({
      ok: {
        phase: 'ended',
        terminal: {
          kind: 'complete',
          message: { id, role: 'tool', blocks: [head] },
          trims: [],
        },
      },
    })
  })
})

describe('the sealed block must equal the head in every key', () => {
  const cases: readonly (readonly [string, Record<string, unknown>])[] = [
    ['id', { id: 'other' }],
    ['visibility', { visibility: { toHuman: false, toModel: true } }],
    ['callId', { callId: 'c2' }],
    ['name', { name: 'other' }],
  ]
  it.each(cases)('rejects a tool_call close whose %s differs', (_key, change) => {
    expect(rejection(run([openCall, fillCall, close({ ...callBlock, ...change })]))).toBe(
      'conflict',
    )
  })

  it.each([
    ['voice', { mediaType: 'audio/ogg' }, 'inline', { mediaType: 'audio/mpeg' }],
    ['image', { mediaType: 'image/png' }, 'inline', { mediaType: 'image/gif' }],
  ] as const)('rejects a %s close whose mediaType differs', (kind, headKeys, body, change) => {
    const head = { kind, id: 'b1', visibility, ...headKeys }
    const sealed = { ...head, [body]: 'x', ...change }
    const steps = [
      { step: 'open', index: '0', mode: kind === 'image' ? 'replace' : 'append', head },
      { step: 'fill', index: '0', seq: '0', chunk: 'x' },
      close(sealed),
    ]
    expect(rejection(run(steps))).toBe('conflict')
  })

  it.each([
    ['storage', { storage: 'other' }],
    ['key', { key: 'other' }],
    ['mediaType', { mediaType: 'text/plain' }],
    ['id', { id: 'other' }],
  ])('rejects a file close whose %s differs', (_key, change) => {
    const head = { kind: 'file', id: 'b1', visibility, storage: 's', key: 'k', mediaType: 'a/b' }
    const steps = [
      { step: 'open', index: '0', mode: 'replace', head },
      close({ ...head, ...change }),
    ]
    expect(rejection(run(steps))).toBe('conflict')
  })

  it('rejects a text close whose kind or visibility differs from the head', () => {
    const head = { kind: 'text', id: 'b1', visibility }
    const steps = (block: unknown) => [
      { step: 'open', index: '0', mode: 'append', head },
      { step: 'fill', index: '0', seq: '0', chunk: 'x' },
      close(block),
    ]
    expect(rejection(run(steps({ kind: 'thinking', id: 'b1', visibility, text: 'x' })))).toBe(
      'conflict',
    )
    expect(
      rejection(
        run(
          steps({
            kind: 'text',
            id: 'b1',
            visibility: { toHuman: false, toModel: false },
            text: 'x',
          }),
        ),
      ),
    ).toBe('conflict')
  })

  it('does not compare arguments with the fill text', () => {
    expect(
      rejection(run([openCall, fillCall, close({ ...callBlock, arguments: { kind: 'null' } })])),
    ).toBe(undefined)
  })
})

describe('the open head is closed', () => {
  function openWith(head: unknown, mode = 'append') {
    return run([{ step: 'open', index: '0', mode, head }])
  }

  it.each([
    ['id', 'id'],
    ['visibility', 'visibility'],
    ['callId', 'callId'],
    ['name', 'name'],
  ])('refuses a tool_call head without %s', (key, detail) => {
    const head: Record<string, unknown> = { ...callHead }
    delete head[key]
    expect(rejection(openWith(head))).toBe(`step:${detail}`)
  })

  it('refuses an empty callId and a name that is not text, and takes an empty name', () => {
    expect(rejection(openWith({ ...callHead, callId: '' }))).toBe('step:callId')
    expect(rejection(openWith({ ...callHead, name: 1 }))).toBe('step:name')
    expect(rejection(openWith({ ...callHead, name: '' }))).toBeUndefined()
  })

  it('refuses a content head without id or visibility', () => {
    expect(rejection(openWith({ kind: 'text', visibility }))).toBe('step:id')
    expect(rejection(openWith({ kind: 'text', id: 'b1' }))).toBe('step:visibility')
    expect(
      rejection(
        openWith({ kind: 'text', id: 'b1', visibility: { toHuman: true, toModel: true, x: 1 } }),
      ),
    ).toBe('step:extra')
  })

  it('refuses an unknown key, the body field, and a head key of another kind', () => {
    const text = { kind: 'text', id: 'b1', visibility }
    expect(rejection(openWith({ ...text, tenant: 'a' }))).toBe('step:extra')
    expect(rejection(openWith({ ...text, text: 'x' }))).toBe('step:extra')
    expect(rejection(openWith({ ...text, mediaType: 'a/b' }))).toBe('step:extra')
    expect(rejection(openWith({ ...callHead, mediaType: 'a/b' }))).toBe('step:extra')
  })

  it('refuses a head key that is not text', () => {
    const voice = { kind: 'voice', id: 'b1', visibility, mediaType: 'a/b' }
    expect(rejection(openWith({ ...voice, mediaType: 1 }))).toBe('step:mediaType')
    expect(rejection(openWith({ ...voice, mediaType: { x: 1 } }))).toBe('step:mediaType')
  })

  it('takes the head keys of each content kind, and the keys come from the content-block table', () => {
    for (const [kind, keys] of Object.entries(CONTENT_BLOCK_HEAD_KEYS)) {
      const head: Record<string, unknown> = { kind, id: 'b1', visibility }
      for (const key of keys) head[key] ??= 'x'
      const mode = kind === 'image' || kind === 'file' ? 'replace' : 'append'
      expect(rejection(openWith(head, mode)), kind).toBeUndefined()
    }
  })

  it('closes an image and a file implicitly into a legal block', () => {
    const image = { kind: 'image', id: 'b1', visibility, mediaType: 'image/png' }
    const file = { kind: 'file', id: 'b2', visibility, storage: 's', key: 'k', mediaType: 'a/b' }
    const result = run([
      { step: 'open', index: '0', mode: 'replace', head: image },
      { step: 'fill', index: '0', seq: '0', chunk: 'png' },
      { step: 'close', index: '0' },
      { step: 'open', index: '1', mode: 'replace', head: file },
      { step: 'close', index: '1' },
      finish,
    ])
    expect(result).toEqual({
      ok: {
        phase: 'ended',
        terminal: {
          kind: 'complete',
          message: { id, role: 'assistant', blocks: [{ ...image, inline: 'png' }, file] },
          trims: [],
        },
      },
    })
  })

  it('refuses a head that names a variant kind', () => {
    for (const kind of ['tool_call_incomplete', 'tool_call_unparsed']) {
      expect(rejection(openWith({ ...callHead, kind }))).toBe('step:kind')
    }
  })

  it('refuses a head with an accessor and calls no getter', () => {
    let called = false
    const head = {
      kind: 'text',
      id: 'b1',
      get visibility() {
        called = true
        return visibility
      },
    }
    expect(rejection(openWith(head))).toBe('step:json')
    expect(called).toBe(false)
  })

  it('does not walk a deep value in a head, and does not throw', () => {
    expect(rejection(openWith({ kind: 'text', id: 'b1', visibility, extra: deep(200_000) }))).toBe(
      'step:extra',
    )
    expect(
      rejection(
        openWith({ kind: 'text', id: 'b1', visibility: { toHuman: deep(200_000), toModel: true } }),
      ),
    ).toBe('step:visibility')
    expect(rejection(openWith({ ...callHead, name: deep(200_000) }))).toBe('step:name')
  })
})

describe('a deep value in a closing block is refused, not thrown', () => {
  it('refuses a deep value under an extra key of a content block and of a tool_call', () => {
    const text = { kind: 'text', id: 'b1', visibility }
    const steps = [
      { step: 'open', index: '0', mode: 'append', head: text },
      { step: 'fill', index: '0', seq: '0', chunk: 'x' },
    ]
    expect(rejection(run([...steps, close({ ...text, text: 'x', extra: deep(200_000) })]))).toBe(
      'block:extra',
    )
    expect(
      rejection(run([openCall, fillCall, close({ ...callBlock, extra: deep(200_000) })])),
    ).toBe('block:extra')
  })

  it('takes a deep arguments tree and fingerprints it without a recursive walk', () => {
    let tree: JsonValue = { kind: 'null' }
    for (let level = 0; level < 100_000; level += 1) tree = { kind: 'array', items: [tree] }
    const steps = [openCall, fillCall, close({ ...callBlock, arguments: tree }), finish]
    const first = run(steps)
    expect('ok' in first).toBe(true)
    if (!('ok' in first)) throw new Error('expected ok')
    const again = assembleStream({ target: target(), from: first.ok, steps })
    expect('ok' in again).toBe(true)
  })
})

describe('a tool_call_unparsed closes by an explicit block', () => {
  const unparsed = {
    kind: 'tool_call_unparsed',
    id: 'k1',
    visibility,
    callId: 'c1',
    name: 'echo',
    raw: '{"a"',
  }
  const raw = { step: 'fill', index: '0', seq: '0', chunk: '{"a"' }

  it('seals when every key matches the head and raw equals the accumulated text', () => {
    const result = run([openCall, raw, close(unparsed), finish])
    expect(result).toEqual({
      ok: {
        phase: 'ended',
        terminal: {
          kind: 'complete',
          message: { id, role: 'assistant', blocks: [unparsed] },
          trims: [],
        },
      },
    })
  })

  it('is a conflict when raw is not the accumulated text', () => {
    expect(rejection(run([openCall, raw, close({ ...unparsed, raw: '{"b"' })]))).toBe('conflict')
  })

  it.each([
    ['id', { id: 'other' }],
    ['visibility', { visibility: { toHuman: true, toModel: false } }],
    ['callId', { callId: 'c2' }],
    ['name', { name: 'other' }],
  ])('is a conflict when %s differs from the head', (_key, change) => {
    expect(rejection(run([openCall, raw, close({ ...unparsed, ...change })]))).toBe('conflict')
  })

  it('is a conflict on a head that is not a tool_call, for either variant', () => {
    const text = { kind: 'text', id: 'k1', visibility }
    const head = { step: 'open', index: '0', mode: 'append', head: text }
    const incomplete = {
      kind: 'tool_call_incomplete',
      id: 'k1',
      visibility: { toHuman: false, toModel: false },
      callId: 'c1',
      name: 'echo',
      partial: '',
    }
    expect(rejection(run([head, close(unparsed)]))).toBe('conflict')
    expect(rejection(run([head, close(incomplete)]))).toBe('conflict')
  })
})

describe('a tool_call_incomplete is never an explicit close', () => {
  it('refuses it even when every key matches the head', () => {
    const incomplete = {
      kind: 'tool_call_incomplete',
      id: 'k1',
      visibility: { toHuman: false, toModel: false },
      callId: 'c1',
      name: 'echo',
      partial: '{"a"',
    }
    const head = { ...callHead, visibility: { toHuman: false, toModel: false } }
    const steps = [
      { step: 'open', index: '0', mode: 'append', head },
      { step: 'fill', index: '0', seq: '0', chunk: '{"a"' },
      close(incomplete),
    ]
    expect(rejection(run(steps))).toBe('block:incomplete')
  })
})

describe('a tool_call block with a trim record cannot be sealed', () => {
  const trim = { step: 'trim', index: '0', removed: '3', reason: 'budget' }
  const unparsed = {
    kind: 'tool_call_unparsed',
    id: 'k1',
    visibility,
    callId: 'c1',
    name: 'echo',
    raw: '{"a":null}',
  }

  it('refuses tool_call and tool_call_unparsed after the trim, even when the text decodes', () => {
    expect(rejection(run([openCall, fillCall, trim, close(callBlock)]))).toBe('block:trimmed')
    expect(rejection(run([openCall, fillCall, trim, close(unparsed)]))).toBe('block:trimmed')
  })

  it('leaves a block alone when the trim names another open block', () => {
    const second = { ...openCall, index: '1', head: { ...callHead, id: 'k2', callId: 'c2' } }
    const trimOther = { ...trim, index: '1' }
    const result = run([openCall, fillCall, second, trimOther, close(callBlock)])
    expect('ok' in result).toBe(true)
  })

  it('refuses a trim on a closed block, so a sealed part never gains a trim record', () => {
    const late = { step: 'trim', index: '0', removed: '1', reason: 'budget' }
    expect(rejection(run([openCall, fillCall, close(callBlock), late]))).toBe('closed')
  })

  it('still lets a text block with a trim record close', () => {
    const text = { kind: 'text', id: 'b1', visibility }
    const result = run([
      { step: 'open', index: '0', mode: 'append', head: text },
      { step: 'fill', index: '0', seq: '0', chunk: 'x' },
      trim,
      { step: 'close', index: '0' },
      finish,
    ])
    expect('ok' in result).toBe(true)
  })

  it('cannot finish: the open block stays open', () => {
    expect(rejection(run([openCall, fillCall, trim, finish]))).toBe('open')
  })
})

describe('the end of a stream leaves the open tool_call out', () => {
  it('lists only the closed parts in a truncated terminal', () => {
    const text = { kind: 'text', id: 'b1', visibility }
    const result = run(
      [
        { step: 'open', index: '0', mode: 'append', head: text },
        { step: 'fill', index: '0', seq: '0', chunk: 'x' },
        { step: 'close', index: '0' },
        { ...openCall, index: '1' },
        { ...fillCall, index: '1' },
      ],
      { kind: 'stopped' },
    )
    if (!('ok' in result) || result.ok.phase !== 'ended') throw new Error('expected ended')
    expect(result.ok.terminal).toEqual({
      kind: 'truncated',
      blocks: [{ ...text, text: 'x' }],
      trims: [],
    })
  })
})

describe('the step fingerprint holds the arguments by their written text', () => {
  function sealed(arguments_: unknown): AssembleResult {
    return run([openCall, fillCall, close({ ...callBlock, arguments: arguments_ })])
  }

  function live(result: AssembleResult): StreamAssembly {
    if (!('ok' in result)) throw new Error('expected ok')
    return result.ok
  }

  it('takes the same close again and refuses a close whose arguments differ', () => {
    const first = live(sealed(args))
    const same = assembleStream({
      target: target(),
      from: first,
      steps: [close(callBlock)],
    })
    expect('ok' in same).toBe(true)
    const other = assembleStream({
      target: target(),
      from: first,
      steps: [close({ ...callBlock, arguments: { kind: 'null' } })],
    })
    expect(rejection(other)).toBe('conflict')
  })

  it('tells 1.0 from 1: the written lexeme is part of the arguments', () => {
    const read = (text: string): JsonValue => {
      const result = readJsonText(text, {
        maxBytes: 100,
        maxDepth: 10,
        maxItems: 10,
        maxMembers: 10,
        maxStringLength: 10,
        maxNumberLength: 10,
      })
      if (result.kind !== 'ok') throw new Error('expected a value tree')
      return result.value
    }
    const first = live(sealed(read('1.0')))
    const other = assembleStream({
      target: target(),
      from: first,
      steps: [close({ ...callBlock, arguments: read('1') })],
    })
    expect(rejection(other)).toBe('conflict')
  })
})

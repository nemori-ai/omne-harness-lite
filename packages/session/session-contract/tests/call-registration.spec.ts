// readCallRegistration (SPEC「稳定调用引用的读取」, #1248 C5): kind, reference and purpose of a
// `call.bound` payload in either stored shape. The in-run sample is a payload the release tree
// wrote in a real run (tests/fixtures/call-bound-in-run.json); the out-of-run shape has no writer
// in the server yet, so it is built with this member's own entry encoder.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { readCallRegistration } from '@omne-harness/session-contract'
import { encodeEntry, toJsonValue } from '../src/entries.ts'
import type { SessionEntry } from '../src/entries.ts'
import type { HistoryEntry } from '../src/faces.ts'

const LIMITS = {
  maxBytes: 1 << 20,
  maxDepth: 64,
  maxItems: 1 << 16,
  maxMembers: 1 << 10,
  maxStringLength: 1 << 16,
  maxNumberLength: 64,
}

function parsed(text: string): JsonValue {
  const read = readJsonText(text, LIMITS)
  if (read.kind !== 'ok') throw new Error(`fixture: ${read.kind}`)
  return read.value
}

const IN_RUN = parsed(
  readFileSync(new URL('./fixtures/call-bound-in-run.json', import.meta.url), 'utf8'),
)

const ORIGIN = {
  owner: 'session',
  via: null,
  source: { owner: 'session', record: 'r', digest: 'd', revision: '1' },
} as unknown as HistoryEntry['origin']

const BINDING = {
  action: 'external/main',
  consumer: { owner: 'x', position: 'p', purpose: 'main', work: 'w' },
  request: { owner: 'x', record: 'r', digest: 'd', revision: '1' },
  initiatingAttempt: null,
}

function outOfRun(producer: Readonly<{ kind: 'model' | 'tool'; call: string }>, purpose: string) {
  const entry = {
    kind: 'call.bound',
    consumption: 'c/1',
    binding: { ...BINDING, producer },
    reference: producer.call,
    purpose,
  } as unknown as SessionEntry
  return encodeEntry(entry, ORIGIN).payload
}

function inRun(registration: unknown) {
  const entry = {
    kind: 'call.bound',
    consumption: 'c/1',
    registration,
    association: null,
  } as unknown as SessionEntry
  return encodeEntry(entry, ORIGIN).payload
}

describe('readCallRegistration', () => {
  it('reads the in-run shape that a real run on the release tree stored', () => {
    expect(readCallRegistration(IN_RUN)).toEqual({
      kind: 'model',
      reference:
        '["model-invocation",2,"mcall_2af366bd146621493b9493655b0a8f83c81d498f_1","mop_2af366bd146621493b9493655b0a8f83c81d498f_1_admit"]',
      purpose: 'main',
    })
  })

  it('reads the out-of-run shape that bindExternalCall stores', () => {
    expect(readCallRegistration(outOfRun({ kind: 'model', call: 'm-1' }, 'main'))).toEqual({
      kind: 'model',
      reference: 'm-1',
      purpose: 'main',
    })
    expect(readCallRegistration(outOfRun({ kind: 'tool', call: 't-1' }, 'action'))).toEqual({
      kind: 'tool',
      reference: 't-1',
      purpose: 'action',
    })
  })

  it('reads an in-run compaction call and an associated tool call', () => {
    const model = {
      kind: 'associated',
      binding: { ...BINDING, producer: { kind: 'model', call: 'm-2' } },
      purpose: 'compaction',
    }
    const tool = {
      kind: 'associated',
      binding: { ...BINDING, producer: { kind: 'tool', call: 't-2' } },
      purpose: 'action',
    }
    expect(readCallRegistration(inRun(model))).toEqual({
      kind: 'model',
      reference: 'm-2',
      purpose: 'compaction',
    })
    expect(readCallRegistration(inRun(tool))).toEqual({
      kind: 'tool',
      reference: 't-2',
      purpose: 'action',
    })
  })

  it('gives a tool registration that is not associated yet no reference', () => {
    const intent = {
      kind: 'tool-intent',
      action: 'step-1/tool',
      consumer: BINDING.consumer,
      request: BINDING.request,
      initiatingAttempt: null,
      purpose: 'action',
    }
    expect(readCallRegistration(inRun(intent))).toEqual({
      kind: 'tool',
      reference: null,
      purpose: 'action',
    })
  })

  it('answers null for a payload that is not a call registration', () => {
    expect(readCallRegistration(toJsonValue({ run: 'run_1', entry: 'interactive' }))).toBeNull()
    expect(readCallRegistration(toJsonValue({ terminal: { run: 'run_1' } }))).toBeNull()
    expect(readCallRegistration({ kind: 'string', value: 'model' })).toBeNull()
  })

  it('answers null when the kind and the purpose do not belong together', () => {
    expect(
      readCallRegistration(toJsonValue({ kind: 'model', reference: 'm', purpose: 'action' })),
    ).toBeNull()
    expect(
      readCallRegistration(toJsonValue({ kind: 'tool', reference: 't', purpose: 'main' })),
    ).toBeNull()
    expect(
      readCallRegistration(toJsonValue({ kind: 'model', reference: 'm', purpose: 'other' })),
    ).toBeNull()
  })
})

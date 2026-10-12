import { expect, test, vi } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { LogEntry } from '@omne-harness-lite/session-log'
import {
  captureToolJournalValue,
  inspectToolJournalEntry,
  prepareToolJournalEntry,
  projectToolJournal,
} from '../src/index.ts'

const scope = {
  tenant: unwrap(parseTenantId({ organization: 'boundaries', account: 'journal-owner' })),
  session: unwrap(parseOpaqueIdentifier('boundary-session', 'SessionRef')),
}
const origin = {
  run: 'boundary-run',
  attempt: new LosslessNumber('9007199254740993'),
  assistantMessage: 'boundary-reply',
}
function intent(callId = 'first') {
  return {
    kind: 'execution_intended',
    revision: 1,
    ref: { ...scope, callId },
    origin,
    input: { parameter: ['original'] },
  }
}
function entry(input: unknown, position = 1): LogEntry {
  const value = captureToolJournalValue(input)
  if ('invalid' in value) throw new Error('invalid boundary value')
  const prepared = prepareToolJournalEntry({ origin, value })
  if ('invalid' in prepared) throw new Error('invalid boundary entry')
  return { ...prepared.entry, session: scope.session, position }
}
function prepare(input: unknown) {
  return Reflect.apply(prepareToolJournalEntry, undefined, [input])
}

test.each([
  ['missing origin', { value: intent() }],
  ['extra input field', { origin, value: intent(), extra: true }],
  ['null origin', { origin: null, value: intent() }],
  ['extra origin field', { origin: { ...origin, extra: true }, value: intent() }],
  ['missing run', { origin: { attempt: 1, assistantMessage: 'reply' }, value: intent() }],
  ['empty run', { origin: { ...origin, run: '' }, value: intent() }],
  ['zero attempt', { origin: { ...origin, attempt: 0 }, value: intent() }],
  ['fractional attempt', { origin: { ...origin, attempt: 1.5 }, value: intent() }],
  ['empty message', { origin: { ...origin, assistantMessage: '' }, value: intent() }],
  ['invalid origin and value', { origin: null, value: { revision: 2 } }],
])('rejects malformed preparation: %s', (_label, input) => {
  expect(prepare(input)).toEqual({ invalid: true })
})

test.each(['run', 'attempt', 'assistantMessage'])('rejects intended origin conflict: %s', field => {
  const changed = { ...origin, [field]: field === 'attempt' ? 2 : 'another' }
  expect(prepare({ origin: changed, value: intent() })).toEqual({ invalid: true })
})

test.each(['origin', 'value', 'attempt', 'assistantMessage'])(
  'rejects preparation accessors without invoking %s',
  field => {
    const get = vi.fn(() => {
      throw new Error('caller accessor executed')
    })
    const input = { origin: { ...origin }, value: intent() }
    const object = field === 'origin' || field === 'value' ? input : input.origin
    Object.defineProperty(object, field, { enumerable: true, get })
    expect(prepare(input)).toEqual({ invalid: true })
    expect(get).not.toHaveBeenCalled()
  },
)

test('retains exact attempt identity and owns the prepared input snapshot', () => {
  const supplied = intent()
  const prepared = prepare({
    origin: { ...origin, attempt: new LosslessNumber('9.007199254740993e15') },
    value: supplied,
  })
  expect(prepared).toHaveProperty('entry')
  supplied.input.parameter.push('changed')
  const inspected = inspectToolJournalEntry(scope, {
    ...prepared.entry,
    session: scope.session,
    position: 1,
  })
  expect(inspected).toHaveProperty('value.input.parameter', ['original'])
  if (!('value' in inspected) || inspected.value.kind !== 'execution_intended')
    throw new Error('expected captured intention')
  expect(writeJsonLossless(inspected.value.origin.attempt)).toBe('9007199254740993')
})

test('accepts reordered read keys and rejects duplicated or foreign lookup identities', () => {
  const row = entry(intent())
  const keys = [...row.readKeys!]
  expect(inspectToolJournalEntry(scope, { ...row, readKeys: [...keys].reverse() })).toHaveProperty(
    'value.ref.callId',
    'first',
  )
  for (const readKeys of [[keys[0]!, keys[0]!, keys[2]!], [...keys, 'foreign'], [keys[0]!]]) {
    expect(inspectToolJournalEntry(scope, { ...row, readKeys })).toEqual({ invalid: true })
  }
  expect(inspectToolJournalEntry(scope, { ...row, dedupeKey: 'foreign' })).toEqual({
    invalid: true,
  })
})

test('a claimed read key fails closed even when other ownership markers are unrelated', () => {
  const row = entry(intent())
  expect(
    inspectToolJournalEntry(scope, {
      ...row,
      dedupeKey: 'foreign',
      readKeys: ['tool-runtime/future'],
      payload: {},
    }),
  ).toEqual({ invalid: true })
  expect(
    inspectToolJournalEntry(scope, { ...row, dedupeKey: 'foreign', readKeys: [], payload: {} }),
  ).toEqual({ unrelated: true })
})

test('projects interleaved calls independently and ignores unrelated domain positions', () => {
  const read = (callId: string) => ({
    kind: 'execution_context_read',
    revision: 1,
    ref: { ...scope, callId },
    readIndex: 1,
    values: [],
  })
  const first = entry(intent(), 1)
  const rows = [
    first,
    entry(intent('second'), 2),
    { ...first, position: 1, dedupeKey: 'another-domain', readKeys: [], payload: {} },
    entry(read('second'), 3),
    entry(read('first'), 4),
  ]
  const history = projectToolJournal(scope, rows)
  if ('invalid' in history) throw new Error('expected independent histories')
  expect([...history.executions.keys()]).toEqual(['first', 'second'])
  expect(history.executions.get('first')?.contextReads[0]?.entry.position).toBe(4)
  expect(history.executions.get('second')?.contextReads[0]?.entry.position).toBe(3)
  expect(history.executions.get('first')?.answers.size).toBe(0)
})

test('rejects duplicate stable identities and non-increasing owned positions', () => {
  const first = entry(intent(), 1)
  for (const rows of [
    [first, { ...first, position: 2 }],
    [first, entry(intent('second'), 1)],
    [first, { ...entry(intent('second')), position: new LosslessNumber('0') }],
    [entry(intent('second'), 2), first],
  ]) {
    expect(projectToolJournal(scope, rows)).toEqual({ invalid: true })
  }
})

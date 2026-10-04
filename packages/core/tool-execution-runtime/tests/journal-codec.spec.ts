import { expect, test, vi } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { LogEntry } from '@omne-harness-lite/session-log'
import { captureToolJournalValue, inspectToolJournalEntry, prepareToolJournalEntry, projectToolJournal, toolJournalKey } from '../src/index.ts'

const scope = { tenant: unwrap(parseTenantId({ organization: 'journal-org', account: 'journal-user' })), session: unwrap(parseOpaqueIdentifier('journal-session', 'SessionRef')) }
const ref = { ...scope, callId: 'call' }, origin = { run: 'run', attempt: new LosslessNumber('9007199254740993'), assistantMessage: 'reply' }
const at = '2026-10-04T00:00:00Z'
const result = { id: 'result', kind: 'tool_result', callId: 'call', outcome: 'completed', visibility: { toHuman: true, toModel: true }, blocks: [] }
const account = { callId: 'call', initiator: scope.tenant, externalEffect: 'unknown', cost: { items: [], total_usd: 0 }, frames: 'unknown', wallClock: { startedAt: at, endedAt: at } }
const values = [
  { kind: 'execution_intended', origin, input: { n: new LosslessNumber('9007199254740993') } },
  { kind: 'execution_started', at },
  { kind: 'resource_planned', resource: { key: 'process', provider: 'host', reference: { invocation: 'opaque-id' } } },
  { kind: 'resource_permitted', key: 'process' },
  { kind: 'execution_waiting', waitIndex: 1, request: { prompt: 'confirm', answerSchema: { type: 'boolean' } } },
  { kind: 'execution_answered', waitIndex: 1, answer: true, by: { kind: 'human', principal: 'member' } },
  { kind: 'execution_ended', terminal: { outcome: 'completed', result: 'done' }, account, delivery: { result, pass: 'after', selectedChain: [] } },
  { kind: 'delivery_ready', result, basis: { kind: 'conclusions', keys: [] } },
  { kind: 'delivery_confirmed', message: { id: 'returned', createdAt: at, type: 'tool', callId: 'call', blocks: [result] } },
  { kind: 'physical_stop_observed', key: 'process', status: 'confirmed', at },
].map(value => ({ revision: 1, ref, ...value }))
function prepared(input: unknown) {
  const value = captureToolJournalValue(input)
  if ('invalid' in value) throw new Error('invalid test value')
  const entry = prepareToolJournalEntry({ value, origin })
  if ('invalid' in entry) throw new Error('invalid test entry')
  return { ...entry.entry, session: scope.session, position: 1 }
}
test.each(values.map(value => [value.kind, value] as const))('captures and interprets %s without number rounding', (_kind, value) => {
  const entry = prepared(value)
  const read = inspectToolJournalEntry(scope, entry)
  expect(read).toHaveProperty('value', value)
  expect(ExactDecimal.from(entry.attempt!).compare(ExactDecimal.from(new LosslessNumber('9007199254740993')))).toBe(0)
  expect(toolJournalKey(value)).toBe(entry.dedupeKey)
})
test.each([
  (row: LogEntry) => ({ ...row, session: 'another-session' }),
  (row: LogEntry) => ({ ...row, tenant: { organization: 'journal-org', account: 'other' } }),
  (row: LogEntry) => ({ ...row, run: 'another-run' }),
  (row: LogEntry) => ({ ...row, attempt: 9007199254740992 }),
  (row: LogEntry) => ({ ...row, position: 0 }),
  (row: LogEntry) => ({ ...row, readKeys: [row.dedupeKey!] }),
  (row: LogEntry) => ({ ...row, dedupeKey: 'tool-runtime/2/future' }),
  (row: LogEntry) => ({ ...row, payload: { format: 'tool-runtime/2', category: 'execution', value: values[0] } }),
  (row: LogEntry) => ({ ...row, extra: true }),
])('rejects wrong durable shell or claimed version %#', change => {
  expect(inspectToolJournalEntry(scope, change(prepared(values[0])) as LogEntry)).toEqual({ invalid: true })
})
test.each([
  { ...values[0], revision: 2 },
  { ...values[0], extra: true },
  { ...values[4], waitIndex: 0 },
  { ...values[4], waitIndex: 9007199254740992 },
  { ...values[4], request: { prompt: null, answerSchema: [], deadline: 'tomorrow' } },
  { ...values[6], account: { ...account, callId: 'other' } },
  { ...values[6], terminal: { outcome: 'failed', code: 'implementation_error' } },
  { ...values[6], terminal: { outcome: 'completed', result: { content: [], isError: true } } },
  { ...values[7], result: { ...result, outcome: 'denied' } },
  { ...values[7], basis: { kind: 'conclusions', keys: ['same', 'same'] } },
  { ...values[8], message: { id: 'returned', createdAt: at, type: 'tool', callId: 'other', blocks: [result] } },
])('rejects malformed or locally contradictory values %#', value => {
  expect(captureToolJournalValue(value)).toEqual({ invalid: true })
})
test('captures before reading accessors and distinguishes unrelated records', () => {
  const get = vi.fn(() => 1), value = { ...values[0] }
  Object.defineProperty(value, 'revision', { enumerable: true, get })
  expect(captureToolJournalValue(value)).toEqual({ invalid: true })
  expect(get).not.toHaveBeenCalled()
  const row = prepared(values[0])
  expect(inspectToolJournalEntry(scope, { ...row, dedupeKey: 'another', readKeys: [], payload: {} })).toEqual({ unrelated: true })
  expect(inspectToolJournalEntry(scope, { ...row, dedupeKey: 'tool-runtime', readKeys: [], payload: {} })).toEqual({ invalid: true })
})

function executionEntries() {
  const intent = { ...values[0], selected: { capability: 'tool:echo', asset: 'echo', version: '1', adoption: 'adoption', definition: {
    name: 'echo', description: 'Echo', paradigm: 'single', origin: { kind: 'authored' }, input: { type: 'object', properties: {} }, permissions: { execute: { default: 'auto' } },
  } } }
  return [intent, ...values.slice(1)].map((value, index) => ({ ...prepared(value), position: index + 1 }))
}
test('projects waiting, answer, final account, delivery and physical cleanup without restarting', () => {
  const entries = executionEntries()
  const history = projectToolJournal(scope, entries)
  expect(history).toHaveProperty('executions')
  if (!('executions' in history)) throw new Error('expected history')
  const execution = history.executions.get('call')
  expect(execution?.waitIndex).toBe(1)
  expect(execution?.waiting).toBeUndefined()
  expect(execution?.answers.get(1)?.value.answer).toBe(true)
  expect(execution?.terminal?.value.terminal.outcome).toBe('completed')
  expect(execution?.confirmed?.value.message.id).toBe('returned')
  expect(execution?.resources.get('process')?.observations[0]?.value.status).toBe('confirmed')
})
test.each([
  [1, 2, 3], // no intent
  [0, 4], // waiting before start
  [0, 1, 5], // answer without waiting
  [0, 1, 3], // permit without planning
  [0, 1, 7], // ready before terminal
  [0, 1, 6, 8], // confirmed before ready
  [0, 1, 6, 4], // waiting after terminal
  [0, 1, 2, 6, 3], // permission after terminal
  [0, 1, 6, 6], // two terminals
  [0, 1, 0], // second intent
].map(indices => ({ indices })))('rejects an impossible transition $indices', ({ indices }) => {
  const full = executionEntries(), entries = indices.map((index, position) => ({ ...full[index]!, position: position + 1 }))
  expect(projectToolJournal(scope, entries)).toEqual({ invalid: true })
})

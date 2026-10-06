import { expect, test, vi } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { LogEntry } from '@omne-harness-lite/session-log'
import {
  captureToolJournalValue,
  environmentToolOf,
  inspectToolJournalEntry,
  prepareToolJournalEntry,
  projectToolJournal,
  toolJournalKey,
} from '../src/index.ts'

const scope = {
  tenant: unwrap(parseTenantId({ organization: 'journal-org', account: 'journal-user' })),
  session: unwrap(parseOpaqueIdentifier('journal-session', 'SessionRef')),
}
const ref = { ...scope, callId: 'call' },
  origin = {
    run: 'run',
    attempt: new LosslessNumber('9007199254740993'),
    assistantMessage: 'reply',
  }
const at = '2026-10-04T00:00:00Z'
const result = {
  id: 'result',
  kind: 'tool_result',
  callId: 'call',
  outcome: 'completed',
  visibility: { toHuman: true, toModel: true },
  blocks: [],
}
const account = {
  callId: 'call',
  initiator: scope.tenant,
  externalEffect: 'unknown',
  cost: { items: [], total_usd: 0 },
  frames: 'unknown',
  wallClock: { startedAt: at, endedAt: at },
}
const values = [
  { kind: 'execution_intended', origin, input: { n: new LosslessNumber('9007199254740993') } },
  { kind: 'execution_started', at },
  {
    kind: 'resource_planned',
    resource: { key: 'process', provider: 'host', reference: { invocation: 'opaque-id' } },
  },
  { kind: 'resource_permitted', key: 'process' },
  {
    kind: 'execution_waiting',
    waitIndex: 1,
    request: { prompt: 'confirm', answerSchema: { type: 'boolean' } },
  },
  {
    kind: 'execution_answered',
    waitIndex: 1,
    answer: true,
    by: { kind: 'human', principal: 'member' },
  },
  {
    kind: 'execution_ended',
    terminal: { outcome: 'completed', result: 'done' },
    account,
    delivery: { result, pass: 'after', selectedChain: [] },
  },
  { kind: 'delivery_ready', result, basis: { kind: 'conclusions', keys: [] } },
  {
    kind: 'delivery_confirmed',
    message: { id: 'returned', createdAt: at, type: 'tool', callId: 'call', blocks: [result] },
  },
  { kind: 'physical_stop_observed', key: 'process', status: 'confirmed', at },
].map(value => ({ revision: 1, ref, ...value }))
function prepared(input: unknown) {
  const value = captureToolJournalValue(input)
  if ('invalid' in value) throw new Error('invalid test value')
  const entry = prepareToolJournalEntry({ value, origin })
  if ('invalid' in entry) throw new Error('invalid test entry')
  return { ...entry.entry, session: scope.session, position: 1 }
}
test.each(values.map(value => [value.kind, value] as const))(
  'captures and interprets %s without number rounding',
  (_kind, value) => {
    const entry = prepared(value)
    const read = inspectToolJournalEntry(scope, entry)
    expect(read).toHaveProperty('value', value)
    expect(
      ExactDecimal.from(entry.attempt!).compare(
        ExactDecimal.from(new LosslessNumber('9007199254740993')),
      ),
    ).toBe(0)
    expect(toolJournalKey(value)).toBe(entry.dedupeKey)
  },
)
test.each([
  (row: LogEntry) => ({ ...row, session: 'another-session' }),
  (row: LogEntry) => ({ ...row, tenant: { organization: 'journal-org', account: 'other' } }),
  (row: LogEntry) => ({ ...row, run: 'another-run' }),
  (row: LogEntry) => ({ ...row, attempt: 9007199254740992 }),
  (row: LogEntry) => ({ ...row, position: 0 }),
  (row: LogEntry) => ({ ...row, readKeys: [row.dedupeKey!] }),
  (row: LogEntry) => ({ ...row, dedupeKey: 'tool-runtime/2/future' }),
  (row: LogEntry) => ({
    ...row,
    payload: { format: 'tool-runtime/2', category: 'execution', value: values[0] },
  }),
  (row: LogEntry) => ({ ...row, extra: true }),
])('rejects wrong durable shell or claimed version %#', change => {
  expect(inspectToolJournalEntry(scope, change(prepared(values[0])) as LogEntry)).toEqual({
    invalid: true,
  })
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
  {
    ...values[8],
    message: { id: 'returned', createdAt: at, type: 'tool', callId: 'other', blocks: [result] },
  },
])('rejects malformed or locally contradictory values %#', value => {
  expect(captureToolJournalValue(value)).toEqual({ invalid: true })
})
test('captures before reading accessors and distinguishes unrelated records', () => {
  const get = vi.fn(() => 1),
    value = { ...values[0] }
  Object.defineProperty(value, 'revision', { enumerable: true, get })
  expect(captureToolJournalValue(value)).toEqual({ invalid: true })
  expect(get).not.toHaveBeenCalled()
  const row = prepared(values[0])
  expect(
    inspectToolJournalEntry(scope, { ...row, dedupeKey: 'another', readKeys: [], payload: {} }),
  ).toEqual({ unrelated: true })
  expect(
    inspectToolJournalEntry(scope, {
      ...row,
      dedupeKey: 'tool-runtime',
      readKeys: [],
      payload: {},
    }),
  ).toEqual({ invalid: true })
})

function executionEntries() {
  const intent = {
    ...values[0],
    selected: {
      capability: 'tool:echo',
      asset: 'echo',
      version: '1',
      adoption: 'adoption',
      definition: {
        name: 'echo',
        description: 'Echo',
        paradigm: 'single',
        origin: { kind: 'authored' },
        input: { type: 'object', properties: {} },
        permissions: { execute: { default: 'auto' } },
      },
    },
  }
  return [intent, ...values.slice(1)].map((value, index) => ({
    ...prepared(value),
    position: index + 1,
  }))
}
test('projects waiting, answer, final account, delivery and physical cleanup without restarting', () => {
  const full = executionEntries(),
    first = inspectToolJournalEntry(scope, full[0]!)
  if (!('value' in first) || first.value.kind !== 'execution_intended' || !first.value.selected)
    throw new Error('fixture intent missing')
  const selected = {
    ...first.value.selected,
    definition: {
      ...first.value.selected.definition,
      settings: {
        targetEnvironment: {
          category: 'placement_identity' as const,
          default: { bindingLayer: 'host_machine' as const, facilities: ['command'] },
        },
      },
    },
  }
  const adopted = prepared({
    kind: 'execution_environment_adopted',
    revision: 1,
    ref,
    adoption: {
      placement: {
        scope,
        execution: ref.callId,
        tool: environmentToolOf(selected),
        requirement: { bindingLayer: 'host_machine', facilities: ['command'] },
        permission: 'always-allow',
        revision: 'current',
        evidence: null,
      },
      source: { name: 'current-tools', generation: 'one' },
      description: {
        reference: { provider: 'host', reference: 'original' },
        bindingLayer: 'host_machine',
        binding: { kind: 'host_machine' },
        facilities: ['command'],
        instance: { id: 'original', generation: 'one' },
        continuity: { kind: 'notGuaranteed' },
      },
      providerEvidence: null,
    },
  })
  const entries = [prepared({ ...first.value, selected }), full[1]!, adopted, ...full.slice(2)].map(
    (value, index) => ({ ...value, position: index + 1 }),
  )
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
test.each(
  [
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
  ].map(indices => ({ indices })),
)('rejects an impossible transition $indices', ({ indices }) => {
  const full = executionEntries(),
    entries = indices.map((index, position) => ({ ...full[index]!, position: position + 1 }))
  expect(projectToolJournal(scope, entries)).toEqual({ invalid: true })
})

test('does not accept an executed result when no function start was recorded', () => {
  const full = executionEntries()
  expect(projectToolJournal(scope, [full[0]!, full[6]!])).toEqual({ invalid: true })
  for (const code of ['implementation_error', 'result_rejected', 'business_failure']) {
    const terminal =
      code === 'business_failure'
        ? { outcome: 'failed', code, result: { content: [], isError: true } }
        : { outcome: 'failed', code }
    const ended = prepared({
      ...values[6],
      terminal,
      delivery: { result: { ...result, outcome: 'failed' }, pass: 'after', selectedChain: [] },
    })
    expect(projectToolJournal(scope, [full[0]!, { ...ended, position: 2 }])).toEqual({
      invalid: true,
    })
  }
})

test('validates empty-prefix scope and captures the collection without invoking accessors', () => {
  expect(projectToolJournal({ ...scope, session: '' } as typeof scope, [])).toEqual({
    invalid: true,
  })
  expect(projectToolJournal(scope, [])).toHaveProperty('executions')
  const get = vi.fn(() => prepared(values[0])),
    entries: LogEntry[] = []
  Object.defineProperty(entries, '0', { enumerable: true, get })
  expect(projectToolJournal(scope, entries)).toEqual({ invalid: true })
  expect(get).not.toHaveBeenCalled()
})

test('retains each actual context adoption in read order and never accepts an adoption after terminal', () => {
  const full = executionEntries()
  const read = (readIndex: number, value: string) =>
    prepared({
      revision: 1,
      ref,
      kind: 'execution_context_read',
      readIndex,
      values: [{ key: 'workspace', revision: `value-${readIndex}`, value, observedAt: at }],
    })
  const history = projectToolJournal(scope, [
    full[0]!,
    { ...read(1, 'first'), position: 2 },
    { ...read(2, 'current'), position: 3 },
  ])
  if (!('executions' in history)) throw new Error('valid context adoption was rejected')
  expect(
    history.executions.get('call')?.contextReads.map(item => item.value.values[0]?.value),
  ).toEqual(['first', 'current'])
  expect(history.executions.get('call')?.started).toBeUndefined()
  expect(projectToolJournal(scope, [full[0]!, { ...read(2, 'skipped'), position: 2 }])).toEqual({
    invalid: true,
  })
  expect(
    projectToolJournal(scope, [
      full[0]!,
      { ...read(1, 'first'), position: 2 },
      { ...read(1, 'changed'), position: 3 },
    ]),
  ).toEqual({ invalid: true })
  expect(
    projectToolJournal(scope, [
      full[0]!,
      full[1]!,
      { ...full[6]!, position: 3 },
      { ...read(1, 'too-late'), position: 4 },
    ]),
  ).toEqual({ invalid: true })
})

test.each([
  { readIndex: 0 },
  { readIndex: 9007199254740992 },
  { values: [{ key: 'workspace', revision: 'one', value: null, observedAt: 'tomorrow' }] },
  { values: [{ key: 'workspace', revision: 'one', value: null, observedAt: at, owner: 'forged' }] },
  {
    values: [
      { key: 'workspace', revision: 'one', value: null, observedAt: at },
      { key: 'workspace', revision: 'two', value: null, observedAt: at },
    ],
  },
])('rejects invalid or ambiguous context adoption %#', change => {
  expect(
    captureToolJournalValue({
      revision: 1,
      ref,
      kind: 'execution_context_read',
      readIndex: 1,
      values: [{ key: 'workspace', revision: 'one', value: null, observedAt: at }],
      ...change,
    }),
  ).toEqual({ invalid: true })
})

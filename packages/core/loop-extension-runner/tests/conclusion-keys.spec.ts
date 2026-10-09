import { expect, test, vi } from 'vitest'
import { isCapabilityName } from '@omne-harness-lite/asset-model'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  judgeConclusionForSubject,
  judgePositionedSubject,
  type Conclusion,
} from '@omne-harness-lite/loop-extension'
import { judgeMessage } from '@omne-harness-lite/messages'
import { checkAppendInput, type LogEntry, type LogEntryInput } from '@omne-harness-lite/session-log'
import {
  dimensionPart,
  inspectRunnerConclusion,
  passKeys,
  prepareRunnerConclusion,
  type PrepareRunnerConclusionInput,
  type RunnerKeyInput,
  type RunnerExecution,
} from '../src/index.ts'

const prepareUnknown: (input: unknown) => ReturnType<typeof prepareRunnerConclusion> = vi
  .fn()
  .mockImplementation(prepareRunnerConclusion)
const inspectUnknown: (input: unknown) => ReturnType<typeof inspectRunnerConclusion> = vi
  .fn()
  .mockImplementation(inspectRunnerConclusion)
const keysUnknown: (input: unknown) => ReturnType<typeof passKeys> = vi
  .fn()
  .mockImplementation(passKeys)

const at = '2026-09-23T10:00:00Z'
const tenant = unwrap(parseTenantId({ organization: 'organization', account: 'account' }))
const session = unwrap(parseOpaqueIdentifier('session_one', 'SessionRef'))
const one = new LosslessNumber('1')
const rawReminder = {
  id: 'reminder_one',
  type: 'system_reminder',
  blocks: [],
  createdAt: at,
  nature: 'event',
  source: { kind: 'extension', extension: 'example:g' },
}
const reminderResult = judgeMessage(rawReminder)
if ('rejected' in reminderResult || reminderResult.ok.type !== 'system_reminder')
  throw new Error('reminder fixture rejected')
const reminder = reminderResult.ok
const user = { id: 'user_one', type: 'user', blocks: [], createdAt: at }
const started = { position: 'attempt_started', subject: { attempt: one } }
const persisting = {
  position: 'before_persist_message',
  subject: { message: user, producer: 'user' },
}
const rawObserved = {
  extension: 'example:g',
  position: 'attempt_started',
  power: 'observe',
  output: { kind: 'observed' },
  at,
}
const rawAsk = {
  ...rawObserved,
  power: 'veto',
  output: {
    kind: 'ask',
    card: {
      explanation: 'Choose whether to continue',
      options: [{ id: 'yes', label: 'Continue' }],
      about: { position: 'attempt_started' },
    },
  },
}
const rawVeto = {
  ...rawObserved,
  position: 'before_persist_message',
  power: 'veto',
  output: { kind: 'veto', reason: 'Message blocked' },
}
const rawUnavailable = {
  extension: 'example:g',
  position: 'before_persist_message',
  power: 'veto',
  skipped: 'unavailable',
  unavailability: 'veto',
  at,
}

function admittedConclusion(positioned: unknown, value: unknown): Conclusion {
  const extensionName = 'example:g'
  if (!isCapabilityName(extensionName)) throw new Error('extension fixture rejected')
  const subject = judgePositionedSubject(positioned)
  if ('rejected' in subject) throw new Error(`subject fixture rejected: ${subject.rejected}`)
  const result = judgeConclusionForSubject(value, {
    positionedSubject: subject.ok,
    extensionName,
  })
  if ('rejected' in result) throw new Error(`conclusion fixture rejected: ${result.rejected}`)
  return result.ok
}
const observed = admittedConclusion(started, rawObserved)
const asked = admittedConclusion(started, rawAsk)
const injected = admittedConclusion(started, {
  ...rawObserved,
  power: 'rewrite',
  output: { kind: 'inject', message: reminder },
})
const vetoed = admittedConclusion(persisting, rawVeto)
const unavailable = admittedConclusion(persisting, rawUnavailable)

function preparation(value: Conclusion = observed): PrepareRunnerConclusionInput {
  return {
    session,
    tenant,
    execution: { kind: 'withRun', run: 'run_one', attempt: one },
    anchor: 'anchor_one',
    occurrence: { kind: 'final' },
    value,
    reminders: [],
  }
}
function persistedEntry(entry: LogEntryInput): LogEntry {
  const checked = checkAppendInput(
    session,
    [entry],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in checked) throw new Error('log fixture rejected')
  const owned = checked.ok.entries[0]
  if (owned === undefined) throw new Error('log fixture missing')
  return { ...owned, session, position: one }
}
const finalKey = 'runner/5/["final","attempt_started",null,"anchor_one","example:g"]'
const passKey = 'runner/5/["pass","attempt_started",null,"anchor_one"]'
const allKey = 'runner/5/["all"]'
const askKey = 'runner/5/["ask","attempt_started",null,"anchor_one","example:g","1"]'
const rawPayload = {
  format: 'runner/5',
  category: 'conclusion',
  anchor: 'anchor_one',
  occurrence: { kind: 'final' },
  value: rawObserved,
  reminders: [],
}
const rawEnvelope = {
  owner: 'loop-extension-runner',
  version: '1',
  kind: 'fact',
  value: rawPayload,
}
const rawEntry = {
  session,
  position: one,
  tenant,
  run: 'run_one',
  attempt: one,
  dedupeKey: finalKey,
  readKeys: [finalKey, passKey, allKey],
  payload: rawEnvelope,
}

const dimensionCases = [
  {
    position: 'after_model_call',
    dimension: { ending: 'complete_reply' },
    part: 'ending:complete_reply',
    pass: 'runner/5/["pass","after_model_call","ending:complete_reply","anchor_one"]',
  },
  {
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    part: 'ending:failure',
    pass: 'runner/5/["pass","after_model_call","ending:failure","anchor_one"]',
  },
  {
    position: 'after_action',
    dimension: { scope: 'each' },
    part: 'scope:each',
    pass: 'runner/5/["pass","after_action","scope:each","anchor_one"]',
  },
  {
    position: 'after_action',
    dimension: { scope: 'batch' },
    part: 'scope:batch',
    pass: 'runner/5/["pass","after_action","scope:batch","anchor_one"]',
  },
] satisfies readonly (Pick<RunnerKeyInput, 'position' | 'dimension'> & {
  part: string
  pass: string
})[]

test.each(dimensionCases)('encodes the $position $part dimension without collisions', item => {
  expect(dimensionPart(item.position, item.dimension)).toBe(item.part)
  expect(
    passKeys({ position: item.position, dimension: item.dimension, anchor: 'anchor_one' }),
  ).toEqual({
    pass: item.pass,
    all: allKey,
  })
})

test.each([
  ['attempt_started', 'runner/5/["pass","attempt_started",null,"anchor_one"]'],
  ['before_persist_message', 'runner/5/["pass","before_persist_message",null,"anchor_one"]'],
  ['after_persist_message', 'runner/5/["pass","after_persist_message",null,"anchor_one"]'],
  ['before_compaction', 'runner/5/["pass","before_compaction",null,"anchor_one"]'],
  ['after_compaction', 'runner/5/["pass","after_compaction",null,"anchor_one"]'],
  ['before_model_call', 'runner/5/["pass","before_model_call",null,"anchor_one"]'],
  ['before_action', 'runner/5/["pass","before_action",null,"anchor_one"]'],
  ['before_terminal', 'runner/5/["pass","before_terminal",null,"anchor_one"]'],
  ['after_terminal', 'runner/5/["pass","after_terminal",null,"anchor_one"]'],
])('keeps %s dimensionless', (position, pass) => {
  expect(dimensionPart(position, undefined)).toBeNull()
  expect(keysUnknown({ position, anchor: 'anchor_one' })).toEqual({ pass, all: allKey })
  expect(keysUnknown({ position, anchor: 'anchor_one', dimension: {} })).toEqual({
    invalidInput: true,
  })
})

test.each([
  undefined,
  null,
  [],
  one,
  {},
  { ending: 'unknown' },
  { scope: 'unknown' },
  { ending: 'failure', extra: true },
  { scope: 'each', extra: true },
])('rejects absent, foreign or open dimension shapes %j', dimension => {
  for (const position of ['after_model_call', 'after_action']) {
    expect(dimensionPart(position, dimension)).toBeUndefined()
    const input =
      dimension === undefined
        ? { position, anchor: 'anchor_one' }
        : { position, anchor: 'anchor_one', dimension }
    expect(keysUnknown(input)).toEqual({ invalidInput: true })
  }
})

test('validates position at passKeys while dimensionPart only selects a dimension', () => {
  expect(dimensionPart('future_position', undefined)).toBeNull()
  expect(keysUnknown({ position: 'future_position', anchor: 'anchor_one' })).toEqual({
    invalidInput: true,
  })
  expect(
    passKeys({
      position: 'attempt_started',
      anchor: 'anchor_one',
      extension: 'example:g',
      occurrence: { kind: 'final' },
    }),
  ).toEqual({
    pass: passKey,
    all: allKey,
    final: finalKey,
  })
})

test.each([
  ['1', askKey],
  ['1.0', askKey],
  ['1e0', askKey],
  [
    '9007199254740992',
    'runner/5/["ask","attempt_started",null,"anchor_one","example:g","9007199254740992"]',
  ],
  [
    '9007199254740993',
    'runner/5/["ask","attempt_started",null,"anchor_one","example:g","9007199254740993"]',
  ],
  ['1.20e2', 'runner/5/["ask","attempt_started",null,"anchor_one","example:g","120"]'],
])('canonicalizes positive ask ordinal %s without rounding', (ordinal, ask) => {
  expect(
    passKeys({
      position: 'attempt_started',
      anchor: 'anchor_one',
      extension: 'example:g',
      occurrence: { kind: 'ask', ordinal: new LosslessNumber(ordinal) },
    }),
  ).toEqual({
    pass: passKey,
    all: allKey,
    ask,
  })
})

test.each([
  null,
  [],
  one,
  { kind: 'future' },
  { kind: 'final', extra: true },
  { kind: 'ask' },
  { kind: 'ask', ordinal: one, extra: true },
  { kind: 'ask', ordinal: '1' },
  ...['0', '-0', '-1', '0.1', '1e-1'].map(ordinal => ({
    kind: 'ask',
    ordinal: new LosslessNumber(ordinal),
  })),
])('rejects malformed occurrence or nonpositive integer ordinal %j', occurrence => {
  expect(
    keysUnknown({
      position: 'attempt_started',
      anchor: 'anchor_one',
      extension: 'example:g',
      occurrence,
    }),
  ).toEqual({ invalidInput: true })
})

test.each([
  null,
  [],
  one,
  {},
  { position: 'attempt_started', anchor: '' },
  { position: 'attempt_started', anchor: ' anchor' },
  { position: 'attempt_started', anchor: 'anchor_one', extra: true },
  { position: 'attempt_started', anchor: 'anchor_one', dimension: undefined },
  { position: 'attempt_started', anchor: 'anchor_one', extension: undefined },
  { position: 'attempt_started', anchor: 'anchor_one', occurrence: undefined },
  { position: 'attempt_started', anchor: 'anchor_one', modelCallId: undefined },
  { position: 'attempt_started', anchor: 'anchor_one', extension: 'example:g' },
  { position: 'attempt_started', anchor: 'anchor_one', occurrence: { kind: 'final' } },
  {
    position: 'attempt_started',
    anchor: 'anchor_one',
    extension: ' bad',
    occurrence: { kind: 'final' },
  },
  { position: 'attempt_started', anchor: 'anchor_one', modelCallId: 'call_one' },
  {
    position: 'after_model_call',
    dimension: { ending: 'complete_reply' },
    anchor: 'anchor_one',
    modelCallId: 'call_one',
  },
  {
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    anchor: 'anchor_one',
    modelCallId: '',
  },
])('rejects key identity and option inconsistency %j', input => {
  expect(keysUnknown(input)).toEqual({ invalidInput: true })
})

test('prepares a frozen owned final and inspects its run, tenant and exact keys', () => {
  const prepared = prepareRunnerConclusion(preparation())
  expect(prepared).toHaveProperty('entry')
  if (!('entry' in prepared)) throw new Error('final preparation rejected')
  expect(prepared.entry).toEqual({
    tenant,
    run: 'run_one',
    attempt: one,
    dedupeKey: finalKey,
    readKeys: [finalKey, passKey, allKey],
    payload: rawEnvelope,
  })
  expect(Object.isFrozen(prepared.entry)).toBe(true)
  expect(Object.isFrozen(prepared.entry.readKeys)).toBe(true)
  expect(Object.isFrozen(prepared.entry.payload)).toBe(true)
  const inspected = inspectRunnerConclusion({
    session,
    tenant,
    entry: persistedEntry(prepared.entry),
  })
  expect(inspected).toEqual({
    conclusion: observed,
    anchor: 'anchor_one',
    occurrence: { kind: 'final' },
    reminders: [],
    execution: { kind: 'withRun', run: 'run_one', attempt: one },
  })
  expect(Object.isFrozen(inspected)).toBe(true)
})

test.each(['1', '1.0', '1e0', '9007199254740993'])(
  'preserves ask history ordinal %s separately from final',
  ordinal => {
    const occurrence = {
      kind: 'ask',
      ordinal: new LosslessNumber(ordinal),
    } satisfies PrepareRunnerConclusionInput['occurrence']
    const prepared = prepareRunnerConclusion({ ...preparation(asked), occurrence })
    if (!('entry' in prepared)) throw new Error('ask preparation rejected')
    const expected =
      ordinal === '9007199254740993'
        ? 'runner/5/["ask","attempt_started",null,"anchor_one","example:g","9007199254740993"]'
        : askKey
    expect(prepared.entry.dedupeKey).toBe(expected)
    expect(prepared.entry.readKeys).toEqual([expected, passKey, allKey])
    const inspected = inspectRunnerConclusion({
      session,
      tenant,
      entry: persistedEntry(prepared.entry),
    })
    expect(inspected).toEqual({
      conclusion: asked,
      anchor: 'anchor_one',
      occurrence,
      reminders: [],
      execution: { kind: 'withRun', run: 'run_one', attempt: one },
    })
  },
)

test.each([vetoed, unavailable])(
  'round trips the persist veto variant %# with each execution mode',
  value => {
    const executions: readonly RunnerExecution[] = [
      { kind: 'noRun' },
      { kind: 'withRun', run: 'run_one', attempt: one },
    ]
    for (const execution of executions) {
      for (const reminders of [[], [reminder]]) {
        const prepared = prepareRunnerConclusion({ ...preparation(value), execution, reminders })
        if (!('entry' in prepared)) throw new Error('persist preparation rejected')
        if (execution.kind === 'noRun') {
          expect(prepared.entry).not.toHaveProperty('run')
          expect(prepared.entry).not.toHaveProperty('attempt')
        } else {
          expect(prepared.entry.run).toBe('run_one')
          expect(prepared.entry.attempt).toEqual(one)
        }
        expect(prepared.entry.readKeys).toEqual([
          'runner/5/["final","before_persist_message",null,"anchor_one","example:g"]',
          'runner/5/["pass","before_persist_message",null,"anchor_one"]',
          allKey,
        ])
        expect(
          inspectRunnerConclusion({ session, tenant, entry: persistedEntry(prepared.entry) }),
        ).toEqual({
          conclusion: value,
          anchor: 'anchor_one',
          occurrence: { kind: 'final' },
          reminders,
          execution,
        })
      }
    }
  },
)

test('retains retry call association in the fourth read key', () => {
  const adaptation = {
    implementation: { name: 'vendor-a.family', revision: '1' },
    definition: { modelId: 'vendor-a/chat-large', revision: '1' },
    configuration: { revision: '1', values: {} },
  }
  const profile = {
    providers: ['provider-a', 'provider-b'],
    allowFallback: true,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 200000,
    maxOutputTokens: 64000,
    inputConstraints: {},
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    },
    adaptation,
    updatedAt: at,
  }
  const dispatch = {
    adaptation,
    kind: 'model_call_dispatched',
    call: 'call_one',
    dispatch: one,
    provider: 'provider-a',
    response: 'response_one',
    profile: { origin: 'official', routeName: 'vendor-a/chat-large' },
    profileSnapshot: profile,
    parameters: {},
    selectedBy: 'session',
    credentialScope: { layer: 'factory' },
  }
  const value = admittedConclusion(
    {
      position: 'after_model_call',
      dimension: { ending: 'failure' },
      subject: {
        failure: 'upstream_unavailable',
        profile,
        dispatches: [dispatch],
        retryConclusions: [],
      },
    },
    {
      ...rawObserved,
      position: 'after_model_call',
      dimension: { ending: 'failure' },
      modelCallId: 'call_one',
      power: 'veto',
      output: { kind: 'retry', plan: { provider: 'provider-b' } },
    },
  )
  const prepared = prepareRunnerConclusion(preparation(value))
  if (!('entry' in prepared)) throw new Error('retry preparation rejected')
  expect(prepared.entry.readKeys).toEqual([
    'runner/5/["final","after_model_call","ending:failure","anchor_one","example:g"]',
    'runner/5/["pass","after_model_call","ending:failure","anchor_one"]',
    allKey,
    'runner/5/["model-call","call_one"]',
  ])
  const entry = persistedEntry(prepared.entry)
  expect(inspectRunnerConclusion({ session, tenant, entry })).toEqual({
    conclusion: value,
    anchor: 'anchor_one',
    occurrence: { kind: 'final' },
    reminders: [],
    execution: { kind: 'withRun', run: 'run_one', attempt: one },
  })
  expect(
    inspectRunnerConclusion({
      session,
      tenant,
      entry: { ...entry, readKeys: entry.readKeys.slice(0, 3) },
    }),
  ).toEqual({ invalid: true })
  expect(
    inspectRunnerConclusion({
      session,
      tenant,
      entry: {
        ...entry,
        readKeys: [...entry.readKeys.slice(0, 3), 'runner/5/["model-call","other_call"]'],
      },
    }),
  ).toEqual({ invalid: true })
})

test.each(['event', 'state'])('restores the exact injected %s reminder', nature => {
  const judged = judgeMessage({ ...rawReminder, nature })
  if ('rejected' in judged || judged.ok.type !== 'system_reminder')
    throw new Error('inject reminder fixture rejected')
  const value = admittedConclusion(started, {
    ...rawObserved,
    power: 'rewrite',
    output: { kind: 'inject', message: judged.ok },
  })
  const prepared = prepareRunnerConclusion({ ...preparation(value), reminders: [judged.ok] })
  if (!('entry' in prepared)) throw new Error('inject preparation rejected')
  const inspected = inspectRunnerConclusion({
    session,
    tenant,
    entry: persistedEntry(prepared.entry),
  })
  expect(inspected).toEqual({
    conclusion: value,
    anchor: 'anchor_one',
    occurrence: { kind: 'final' },
    reminders: [judged.ok],
    execution: { kind: 'withRun', run: 'run_one', attempt: one },
  })
  if (!('reminders' in inspected)) throw new Error('injected inspection rejected')
  expect(inspected.reminders[0]).not.toBe(judged.ok)
  expect(Object.isFrozen(inspected.reminders)).toBe(true)
})

test('rejects a valid event reminder whose source is not the extension', () => {
  const judged = judgeMessage({
    ...rawReminder,
    source: { kind: 'loop_guard', level: 'level_1', finding: 'Repeated calls' },
  })
  if ('rejected' in judged || judged.ok.type !== 'system_reminder')
    throw new Error('foreign reminder fixture rejected')
  expect(prepareRunnerConclusion({ ...preparation(vetoed), reminders: [judged.ok] })).toEqual({
    invalidInput: true,
  })
})

test.each([
  { label: 'missing inject copy', value: injected, reminders: [] },
  { label: 'two inject copies', value: injected, reminders: [reminder, reminder] },
  { label: 'copy for observed', value: observed, reminders: [reminder] },
  { label: 'two veto copies', value: vetoed, reminders: [reminder, reminder] },
  { label: 'wrong inject ID', value: injected, reminders: [{ ...rawReminder, id: 'different' }] },
  {
    label: 'wrong inject content',
    value: injected,
    reminders: [{ ...rawReminder, createdAt: '2026-09-24T10:00:00Z' }],
  },
  {
    label: 'foreign extension',
    value: vetoed,
    reminders: [{ ...rawReminder, source: { kind: 'extension', extension: 'example:other' } }],
  },
  {
    label: 'nonextension source',
    value: vetoed,
    reminders: [
      {
        ...rawReminder,
        source: { kind: 'loop_guard', level: 'level_1', finding: 'Repeated calls' },
      },
    ],
  },
  { label: 'state veto copy', value: vetoed, reminders: [{ ...rawReminder, nature: 'state' }] },
  { label: 'invalid reminder ID', value: vetoed, reminders: [{ ...rawReminder, id: '' }] },
  { label: 'user message copy', value: vetoed, reminders: [user] },
  { label: 'nonarray copies', value: observed, reminders: {} },
])(
  'rejects reminder inconsistency during preparation and inspection: $label',
  ({ value, reminders }) => {
    expect(prepareUnknown({ ...preparation(value), reminders })).toEqual({
      invalidInput: true,
    })
    const payload = { ...rawPayload, value, reminders }
    const keys =
      value.position === 'before_persist_message'
        ? [
            'runner/5/["final","before_persist_message",null,"anchor_one","example:g"]',
            'runner/5/["pass","before_persist_message",null,"anchor_one"]',
            allKey,
          ]
        : [finalKey, passKey, allKey]
    expect(
      inspectUnknown({
        session,
        tenant,
        entry: {
          ...rawEntry,
          dedupeKey: keys[0],
          readKeys: keys,
          payload: { ...rawEnvelope, value: payload },
        },
      }),
    ).toEqual({ invalid: true })
  },
)

test.each([
  null,
  [],
  one,
  { kind: 'noRun' },
  { kind: 'noRun', extra: true },
  { kind: 'withRun', run: '', attempt: one },
  { kind: 'withRun', run: 'run_one' },
  { kind: 'withRun', run: 'run_one', attempt: one, extra: true },
  ...['0', '-1', '1.5'].map(attempt => ({
    kind: 'withRun',
    run: 'run_one',
    attempt: new LosslessNumber(attempt),
  })),
])('rejects invalid execution or noRun outside persistence %j', execution => {
  expect(prepareUnknown({ ...preparation(), execution })).toEqual({
    invalidInput: true,
  })
})

test.each([
  null,
  [],
  one,
  { kind: 'final', extra: true },
  { kind: 'ask' },
  { kind: 'ask', ordinal: one },
  { kind: 'ask', ordinal: '1' },
])('rejects final conclusion occurrence mismatch %j', occurrence => {
  expect(prepareUnknown({ ...preparation(), occurrence })).toEqual({
    invalidInput: true,
  })
})

test.each(['0', '-1', '0.1'])('rejects invalid ask ordinal %s in prepare and inspect', ordinal => {
  const occurrence = { kind: 'ask', ordinal: new LosslessNumber(ordinal) }
  expect(prepareUnknown({ ...preparation(asked), occurrence })).toEqual({
    invalidInput: true,
  })
  expect(
    inspectUnknown({
      session,
      tenant,
      entry: {
        ...rawEntry,
        payload: { ...rawEnvelope, value: { ...rawPayload, occurrence, value: rawAsk } },
      },
    }),
  ).toEqual({ invalid: true })
})

test.each([
  { ...preparation(), extra: true },
  { ...preparation(), tenant: {} },
  { ...preparation(), session: '' },
  { ...preparation(), anchor: ' bad' },
  { ...preparation(), value: null },
  { ...preparation(), value: { ...rawObserved, extra: true } },
  { ...preparation(), value: { ...rawObserved, output: { kind: 'unknown' } } },
  { ...preparation(asked), occurrence: { kind: 'final' } },
  null,
  [],
  one,
])('rejects malformed preparation input %#', input => {
  expect(prepareUnknown(input)).toEqual({ invalidInput: true })
})

test.each([
  { ...rawEntry, extra: true },
  { ...rawEntry, session: 'other_session' },
  { ...rawEntry, tenant: { organization: 'organization', account: 'other_account' } },
  { ...rawEntry, tenant: {} },
  { ...rawEntry, position: '1' },
  ...['0', '-1', '0.1'].map(position => ({ ...rawEntry, position: new LosslessNumber(position) })),
  { ...rawEntry, run: '' },
  { ...rawEntry, attempt: new LosslessNumber('0') },
  { ...rawEntry, attempt: undefined },
  { ...rawEntry, run: undefined },
  Object.fromEntries(
    Object.entries(rawEntry).filter(([key]) => key !== 'run' && key !== 'attempt'),
  ),
])('rejects invalid persisted shell or noRun outside persistence %#', entry => {
  expect(inspectUnknown({ session, tenant, entry })).toEqual({ invalid: true })
})

test.each([
  { ...rawEnvelope, owner: 'other-owner' },
  { ...rawEnvelope, version: '2' },
  { ...rawEnvelope, kind: 'other' },
  { ...rawEnvelope, extra: true },
  null,
  { ...rawEnvelope, value: { ...rawPayload, format: 'runner/6' } },
  { ...rawEnvelope, value: { ...rawPayload, category: 'other' } },
  { ...rawEnvelope, value: { ...rawPayload, extra: true } },
  {
    ...rawEnvelope,
    value: Object.fromEntries(Object.entries(rawPayload).filter(([key]) => key !== 'reminders')),
  },
  { ...rawEnvelope, value: { ...rawPayload, value: null } },
  { ...rawEnvelope, value: { ...rawPayload, occurrence: { kind: 'final', extra: true } } },
  { ...rawEnvelope, value: { ...rawPayload, occurrence: { kind: 'ask', ordinal: one } } },
  { ...rawEnvelope, value: { ...rawPayload, value: rawAsk } },
  { ...rawEnvelope, value: { ...rawPayload, anchor: '' } },
])('rejects runner envelope, payload and occurrence conflicts %#', payload => {
  expect(inspectUnknown({ session, tenant, entry: { ...rawEntry, payload } })).toEqual({
    invalid: true,
  })
})

test.each([
  {
    ...rawEntry,
    dedupeKey: 'runner/5/["final","attempt_started",null,"other_anchor","example:g"]',
  },
  { ...rawEntry, dedupeKey: askKey },
  { ...rawEntry, readKeys: [passKey, finalKey, allKey] },
  { ...rawEntry, readKeys: [finalKey, passKey] },
  { ...rawEntry, readKeys: [finalKey, passKey, allKey, 'other-key'] },
  { ...rawEntry, readKeys: [finalKey, passKey, passKey] },
  { ...rawEntry, readKeys: [finalKey, passKey, 'runner/5/["other"]'] },
])('rejects dedupe and read-key conflicts without reordering %#', entry => {
  expect(inspectUnknown({ session, tenant, entry })).toEqual({ invalid: true })
})

test('distinguishes unrelated entries from unknown runner claims', () => {
  const unrelated = {
    ...rawEntry,
    dedupeKey: 'other/key',
    readKeys: ['other/key'],
    payload: { owner: 'other-owner', version: '1', kind: 'fact', value: {} },
  }
  expect(inspectUnknown({ session, tenant, entry: unrelated })).toEqual({
    unrelated: true,
  })
  for (const entry of [
    { ...unrelated, dedupeKey: 'runner/99/future' },
    { ...unrelated, readKeys: ['other/key', 'runner/99/future'] },
    { ...unrelated, payload: { ...rawEnvelope, version: '99' } },
  ])
    expect(inspectUnknown({ session, tenant, entry })).toEqual({ invalid: true })
})

test.each([
  null,
  [],
  one,
  { session, tenant, entry: null },
  { session, tenant, entry: [] },
  { session: '', tenant, entry: rawEntry },
  { session, tenant: {}, entry: rawEntry },
])('rejects malformed inspection inputs %#', input => {
  expect(inspectUnknown(input)).toEqual({ invalid: true })
})

test('rejects non-JSON and accessor inputs without executing getters', () => {
  const getter = vi.fn(() => 'session_one')
  const accessorPreparation = Object.defineProperty({ ...preparation() }, 'session', {
    enumerable: true,
    get: getter,
  })
  const accessorInspection = Object.defineProperty({ session, tenant, entry: rawEntry }, 'entry', {
    enumerable: true,
    get: getter,
  })
  expect(prepareUnknown(accessorPreparation)).toEqual({ invalidInput: true })
  expect(inspectUnknown(accessorInspection)).toEqual({ invalid: true })
  expect(getter).not.toHaveBeenCalled()
  for (const illegal of [undefined, () => null, Symbol('not-json'), 1n, new Date(at), Number.NaN]) {
    expect(prepareUnknown({ ...preparation(), value: illegal })).toEqual({
      invalidInput: true,
    })
    expect(inspectUnknown({ session, tenant, entry: { ...rawEntry, payload: illegal } })).toEqual({
      invalid: true,
    })
  }
})

test('owns snapshots independently of later caller mutations', () => {
  const mutableReminder = { ...rawReminder, source: { ...rawReminder.source } }
  const mutableConclusion = {
    ...rawObserved,
    power: 'rewrite',
    output: { kind: 'inject', message: mutableReminder },
  }
  const mutableInput = { ...preparation(), value: mutableConclusion, reminders: [mutableReminder] }
  const prepared = prepareUnknown(mutableInput)
  if (!('entry' in prepared)) throw new Error('mutable preparation rejected')
  mutableReminder.id = 'changed_reminder'
  mutableReminder.source.extension = 'example:changed'
  mutableInput.reminders.length = 0
  mutableInput.anchor = 'changed_anchor'
  const inspected = inspectRunnerConclusion({
    session,
    tenant,
    entry: persistedEntry(prepared.entry),
  })
  expect(inspected).toEqual({
    conclusion: injected,
    anchor: 'anchor_one',
    occurrence: { kind: 'final' },
    reminders: [reminder],
    execution: { kind: 'withRun', run: 'run_one', attempt: one },
  })
  const readInput = {
    ...rawEntry,
    readKeys: [...rawEntry.readKeys],
    payload: {
      ...rawEnvelope,
      value: { ...rawPayload, value: { ...rawObserved, output: { kind: 'observed' } } },
    },
  }
  const read = inspectUnknown({ session, tenant, entry: readInput })
  readInput.readKeys.length = 0
  readInput.payload.value.anchor = 'changed_anchor'
  readInput.payload.value.value.output.kind = 'changed'
  expect(read).toEqual({
    conclusion: observed,
    anchor: 'anchor_one',
    occurrence: { kind: 'final' },
    reminders: [],
    execution: { kind: 'withRun', run: 'run_one', attempt: one },
  })
})

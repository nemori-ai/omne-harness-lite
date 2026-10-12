import { expect, test, vi } from 'vitest'
import { isCapabilityName } from '@omne-harness-lite/asset-model'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  judgeConclusionForSubject,
  judgePositionedSubject,
  type Conclusion,
  type PositionedSubject,
} from '@omne-harness-lite/loop-extension'
import {
  checkAppendInput,
  factLogPayload,
  type LogEntry,
  type LogEntryInput,
} from '@omne-harness-lite/session-log'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import {
  composeEffect,
  prepareRunnerConclusion,
  readRunnerRetryConclusions,
  type ReadRunnerRetryConclusionsInput,
} from '../src/index.ts'

const composeUnknown: (initial: unknown, conclusions: unknown) => ReturnType<typeof composeEffect> =
  vi.fn().mockImplementation(composeEffect)
const retryUnknown: (input: unknown) => ReturnType<typeof readRunnerRetryConclusions> = vi
  .fn()
  .mockImplementation(readRunnerRetryConclusions)
const at = '2026-09-23T10:00:00Z'
const tenant = unwrap(parseTenantId({ organization: 'organization', account: 'account' }))
const session = unwrap(parseOpaqueIdentifier('retry_session', 'SessionRef'))
const one = new LosslessNumber('1')
const user = { id: 'user_one', type: 'user', blocks: [], createdAt: at }
const reminder = {
  id: 'reminder_one',
  type: 'system_reminder',
  blocks: [],
  createdAt: at,
  nature: 'event',
  source: { kind: 'extension', extension: 'example:g' },
}
const adaptation = {
  implementation: { name: 'vendor.family', revision: '1' },
  definition: { modelId: 'vendor/model', revision: '1' },
  configuration: { revision: '1', values: {} },
}
const profile = {
  providers: ['provider-a', 'provider-b'],
  allowFallback: true,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 1000,
  maxOutputTokens: 100,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
  adaptation,
  updatedAt: at,
}

function subject(value: unknown): PositionedSubject {
  const result = judgePositionedSubject(value)
  if ('rejected' in result) throw new Error(`subject fixture rejected: ${result.rejected}`)
  return result.ok
}
function conclusion(initial: PositionedSubject, fields: object): Conclusion {
  const extension = 'example:g'
  if (!isCapabilityName(extension)) throw new Error('extension fixture rejected')
  const result = judgeConclusionForSubject(
    {
      extension,
      position: initial.position,
      ...(initial.dimension === undefined ? {} : { dimension: initial.dimension }),
      power: 'veto',
      at,
      ...fields,
    },
    { positionedSubject: initial, extensionName: extension },
  )
  if ('rejected' in result) throw new Error(`conclusion fixture rejected: ${result.rejected}`)
  return result.ok
}
function failure(call = 'call_one'): PositionedSubject {
  return subject({
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    subject: {
      failure: 'upstream_unavailable',
      profile,
      retryConclusions: [],
      dispatches: [
        {
          adaptation,
          kind: 'model_call_dispatched',
          call,
          dispatch: 1,
          provider: 'provider-a',
          response: 'response_one',
          profile: { origin: 'official', routeName: 'vendor/model' },
          profileSnapshot: profile,
          parameters: {},
          selectedBy: 'session',
          credentialScope: { layer: 'factory' },
        },
      ],
    },
  })
}
const started = subject({ position: 'attempt_started', subject: { attempt: one } })
const persisting = subject({
  position: 'before_persist_message',
  subject: { message: user, producer: 'user' },
})
const request = {
  target: 'vendor/model',
  parameters: { temperature: new LosslessNumber('0.2') },
  messages: [user],
  tools: ['shell'],
}
const beforeModel = subject({ position: 'before_model_call', subject: { request } })
const completeReply = subject({
  position: 'after_model_call',
  dimension: { ending: 'complete_reply' },
  subject: {
    reply: {
      id: 'reply_one',
      type: 'assistant',
      response: 'response_one',
      ending: 'complete',
      blocks: [],
      createdAt: at,
    },
    usage: {
      input_tokens: 'unknown',
      output_tokens: 'unknown',
      cache_read_tokens: 'unknown',
      cache_write_tokens: 'unknown',
      source: 'none',
    },
    cost: { cost_usd: 'unknown', source: 'none' },
  },
})
const observed = conclusion(started, { output: { kind: 'observed' } })

test('preserves the original subject for an empty chain, observations, injection and skips', () => {
  const chain = [
    observed,
    conclusion(started, { output: { kind: 'inject', message: reminder } }),
    conclusion(started, { skipped: 'unavailable', unavailability: 'skip' }),
    conclusion(started, { skipped: 'unavailable', unavailability: 'fallback' }),
    conclusion(started, { skipped: 'errored', error: 'malformed', output: { kind: 'observed' } }),
  ]
  expect(composeEffect(started, [])).toEqual({
    effect: { kind: 'proceed', subject: { attempt: 1 } },
  })
  expect(composeEffect(started, chain)).toEqual({
    effect: { kind: 'proceed', subject: { attempt: 1 } },
  })
  expect(started).toEqual({ position: 'attempt_started', subject: { attempt: 1 } })
  expect(chain[1]?.output).toEqual({ kind: 'inject', message: reminder })
})

test('applies successive request rewrites and model selections without losing other request members', () => {
  const firstRequest = { ...request, parameters: { temperature: new LosslessNumber('0.4') } }
  const lastRequest = {
    ...request,
    parameters: { temperature: new LosslessNumber('0.8') },
    messages: [],
  }
  const first = conclusion(beforeModel, {
    output: { kind: 'rewrite', subject: { request: firstRequest } },
  })
  const rewritten = subject({ position: 'before_model_call', subject: { request: firstRequest } })
  const last = conclusion(rewritten, {
    output: { kind: 'rewrite', subject: { request: lastRequest } },
  })
  const selectFirst = conclusion(beforeModel, {
    output: { kind: 'select_model', profile: 'vendor/first' },
  })
  const selectLast = conclusion(beforeModel, {
    output: { kind: 'select_model', profile: 'vendor/last' },
  })
  expect(
    modelLogJsonEqual(composeEffect(beforeModel, [first, last]), {
      effect: { kind: 'proceed', subject: { request: lastRequest } },
    }),
  ).toBe(true)
  expect(
    modelLogJsonEqual(composeEffect(beforeModel, [selectFirst, selectLast]), {
      effect: { kind: 'proceed', subject: { request: { ...request, target: 'vendor/last' } } },
    }),
  ).toBe(true)
  const result = composeEffect(beforeModel, [first, last, selectFirst, selectLast])
  expect(
    modelLogJsonEqual(result, {
      effect: { kind: 'proceed', subject: { request: { ...lastRequest, target: 'vendor/last' } } },
    }),
  ).toBe(true)
  expect(
    modelLogJsonEqual(beforeModel, { position: 'before_model_call', subject: { request } }),
  ).toBe(true)
  if (!('effect' in result) || result.effect.kind !== 'proceed') throw new Error('effect missing')
  expect(Object.isFrozen(result.effect.subject)).toBe(true)
})

test('rewrites a user message while retaining its producer', () => {
  const message = {
    ...user,
    blocks: [
      {
        id: 'text_one',
        kind: 'text',
        text: 'Rewritten',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  }
  const rewrite = conclusion(persisting, {
    output: { kind: 'rewrite', subject: { message, producer: 'user' } },
  })
  expect(composeEffect(persisting, [rewrite])).toEqual({
    effect: { kind: 'proceed', subject: { message, producer: 'user' } },
  })
  expect(persisting).toEqual({
    position: 'before_persist_message',
    subject: { message: user, producer: 'user' },
  })
})

const card = {
  explanation: 'Continue this attempt?',
  options: [{ id: 'yes', label: 'Continue', effect: { approved: true } }],
  about: { position: 'attempt_started' },
}
const retryPlan = { provider: 'provider-b', after: 'PT0.125S' }
test.each([
  {
    initial: persisting,
    fields: { output: { kind: 'veto', reason: 'Blocked' } },
    expected: { kind: 'vetoed', by: 'example:g' },
  },
  {
    initial: persisting,
    fields: { skipped: 'unavailable', unavailability: 'veto' },
    expected: { kind: 'vetoed', by: 'example:g' },
  },
  {
    initial: started,
    fields: { output: { kind: 'stop', terminal: 'failed', reason: 'Ended' } },
    expected: { kind: 'stopped', by: 'example:g' },
  },
  {
    initial: started,
    fields: { output: { kind: 'ask', card } },
    expected: { kind: 'asked', card, by: 'example:g' },
  },
  {
    initial: failure(),
    fields: { modelCallId: 'call_one', output: { kind: 'retry', plan: retryPlan } },
    expected: { kind: 'retry', plan: retryPlan },
  },
])(
  'returns the exact terminal effect and rejects a trailing conclusion %#',
  ({ initial, fields, expected }) => {
    const terminal = conclusion(initial, fields)
    expect(composeEffect(initial, [terminal])).toEqual({ effect: expected })
    expect(composeEffect(initial, [terminal, terminal])).toEqual({ invalidInput: true })
  },
)

test('converts a genuine LC pairing TypeError into invalidInput', () => {
  const afterPersist = subject({ position: 'after_persist_message', subject: { message: user } })
  const wrongPosition = conclusion(afterPersist, { output: { kind: 'observed' } })
  expect(() =>
    judgeConclusionForSubject(wrongPosition, {
      positionedSubject: started,
      extensionName: wrongPosition.extension,
    }),
  ).toThrow(TypeError)
  expect(composeEffect(started, [wrongPosition])).toEqual({ invalidInput: true })
})

test.each([
  { ...observed, output: { kind: 'select_model', profile: 'vendor/other' } },
  { ...observed, extra: true },
  { ...observed, extension: '' },
  { ...observed, output: { kind: 'unknown' } },
  {
    ...observed,
    output: {
      kind: 'inject',
      message: { ...reminder, source: { kind: 'extension', extension: 'example:other' } },
    },
  },
  {
    ...observed,
    output: { kind: 'ask', card: { ...card, about: { position: 'before_model_call' } } },
  },
  null,
  [],
  1,
])('rejects malformed or incoherent conclusions %#', invalid => {
  expect(composeUnknown(started, [invalid])).toEqual({ invalidInput: true })
})

test('rejects a rewrite of immutable request members after a legal positive control', () => {
  const valid = conclusion(beforeModel, {
    output: { kind: 'rewrite', subject: { request: { ...request, parameters: {} } } },
  })
  expect(composeEffect(beforeModel, [valid])).toEqual({
    effect: { kind: 'proceed', subject: { request: { ...request, parameters: {} } } },
  })
  expect(
    composeUnknown(beforeModel, [
      {
        ...valid,
        output: { kind: 'rewrite', subject: { request: { ...request, target: 'vendor/other' } } },
      },
    ]),
  ).toEqual({ invalidInput: true })
})

test.each([
  null,
  { position: 'unknown', subject: {} },
  { position: 'attempt_started', subject: { attempt: 0 } },
])('rejects an invalid positioned subject %#', initial => {
  expect(composeUnknown(initial, [])).toEqual({ invalidInput: true })
})

test.each([null, {}, [undefined], [Number.NaN], new Array(1)])(
  'rejects non-JSON or non-array conclusions %#',
  values => {
    expect(composeUnknown(started, values)).toEqual({ invalidInput: true })
  },
)

test('does not execute getters and preserves an unexpected copy-boundary exception', () => {
  const getter = vi.fn(() => 'example:g')
  const invalid = Object.defineProperty({ ...observed }, 'extension', {
    enumerable: true,
    get: getter,
  })
  expect(composeUnknown(started, [invalid])).toEqual({ invalidInput: true })
  expect(getter).not.toHaveBeenCalled()
  const error = new Error('copy failed')
  const proxy = new Proxy([], {
    ownKeys() {
      throw error
    },
  })
  expect(() => composeUnknown(started, proxy)).toThrow(error)
})

function persisted(entry: LogEntryInput, position: number): LogEntry {
  const checked = checkAppendInput(
    session,
    [entry],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in checked || checked.ok.entries[0] === undefined)
    throw new Error('log fixture rejected')
  return { ...checked.ok.entries[0], session, position }
}
function recorded(value: Conclusion, anchor: string, position: number): LogEntry {
  const prepared = prepareRunnerConclusion({
    session,
    tenant,
    execution: { kind: 'withRun', run: 'run_one', attempt: one },
    anchor,
    occurrence: { kind: 'final' },
    value,
    reminders: [],
  })
  if ('invalidInput' in prepared) throw new Error('runner fixture rejected')
  return persisted(prepared.entry, position)
}
function retry(call: string, plan: object, timestamp = at): Conclusion {
  return conclusion(failure(call), {
    modelCallId: call,
    at: timestamp,
    output: { kind: 'retry', plan },
  })
}
function prefix(entries: readonly LogEntry[]): ReadRunnerRetryConclusionsInput {
  return { session, tenant, callId: 'call_one', entries, tail: entries.length }
}
const retryFirst = retry('call_one', retryPlan)
const retryLast = retry('call_one', { provider: 'provider-a' }, '2026-09-22T10:00:00Z')
const firstEntry = recorded(retryFirst, 'failure_one', 1)
const unrelated = persisted(
  { tenant, readKeys: [], payload: factLogPayload('example.owner', '1', { note: 'retained' }) },
  1,
)

test('reads only current-call effective retries in durable order with complete plans', () => {
  const entries = [
    unrelated,
    recorded(observed, 'started', 2),
    recorded(
      conclusion(failure(), { modelCallId: 'call_one', output: { kind: 'observed' } }),
      'observed_failure',
      3,
    ),
    recorded(
      conclusion(failure(), {
        modelCallId: 'call_one',
        skipped: 'unavailable',
        unavailability: 'skip',
      }),
      'skipped_failure',
      4,
    ),
    recorded(retry('call_other', { provider: 'provider-b', after: 'PT5S' }), 'other_failure', 5),
    recorded(retryFirst, 'failure_one', 6),
    recorded(retryLast, 'failure_two', 7),
    recorded(retryFirst, 'failure_three', 8),
    recorded(conclusion(completeReply, { output: { kind: 'observed' } }), 'complete_reply', 9),
  ]
  const result = readRunnerRetryConclusions(prefix(entries))
  expect(result).toEqual({ conclusions: [retryFirst, retryLast, retryFirst] })
  if (!('conclusions' in result)) throw new Error('retry history missing')
  expect(Object.isFrozen(result)).toBe(true)
  expect(Object.isFrozen(result.conclusions)).toBe(true)
  expect(result.conclusions[0]).not.toBe(retryFirst)
  expect(result.conclusions.map(value => value.output.plan)).toEqual([
    retryPlan,
    { provider: 'provider-a' },
    retryPlan,
  ])
})

test('rejects retry conclusions that contradict the current call or the retry plan shape', () => {
  expect(composeEffect(failure(), [retryFirst])).toEqual({
    effect: { kind: 'retry', plan: retryPlan },
  })
  expect(composeUnknown(failure(), [{ ...retryFirst, modelCallId: 'call_other' }])).toEqual({
    invalidInput: true,
  })
  expect(
    composeUnknown(failure(), [
      { ...retryFirst, output: { kind: 'retry', plan: { provider: 'provider-b', after: 0.125 } } },
    ]),
  ).toEqual({ invalidInput: true })
  expect(
    composeUnknown(failure(), [{ ...retryFirst, skipped: 'unavailable', unavailability: 'skip' }]),
  ).toEqual({ invalidInput: true })
})

test('accepts empty history and exact decimal position and tail encodings', () => {
  expect(readRunnerRetryConclusions(prefix([]))).toEqual({ conclusions: [] })
  expect(readRunnerRetryConclusions(prefix([unrelated]))).toEqual({ conclusions: [] })
  expect(
    readRunnerRetryConclusions({
      ...prefix([firstEntry]),
      entries: [{ ...firstEntry, position: new LosslessNumber('1.0') }],
      tail: new LosslessNumber('1e0'),
    }),
  ).toEqual({ conclusions: [retryFirst] })
})

test.each([
  { ...prefix([firstEntry]), tail: 0 },
  { ...prefix([firstEntry]), tail: 2 },
  { ...prefix([]), tail: -1 },
  { ...prefix([]), tail: 0.5 },
  { ...prefix([]), session: '' },
  { ...prefix([]), callId: '' },
  { ...prefix([]), tenant: { organization: '', account: 'account' } },
  { ...prefix([]), entries: {} },
  null,
  { ...prefix([]), tail: Number.NaN },
])('denies malformed or incomplete prefix metadata %#', input => {
  expect(retryUnknown(input)).toEqual({ unavailable: true })
})

test.each([
  null,
  { ...firstEntry, position: 0 },
  { ...firstEntry, position: 2 },
  { ...firstEntry, position: 1.5 },
  { ...firstEntry, session: 'other_session' },
  { ...firstEntry, tenant: { organization: 'other', account: 'account' } },
  { ...firstEntry, run: '' },
  { ...firstEntry, attempt: 0 },
  { ...firstEntry, payload: null },
  { ...firstEntry, readKeys: firstEntry.readKeys.slice(0, 3) },
  { ...firstEntry, dedupeKey: 'runner/99/future' },
  { ...unrelated, readKeys: ['runner/99/future'] },
  { ...unrelated, payload: factLogPayload('loop-extension-runner', '99', {}) },
])('denies malformed entries and unknown runner claims %#', entry => {
  expect(retryUnknown({ ...prefix([]), entries: [entry], tail: 1 })).toEqual({ unavailable: true })
})

test('denies duplicate runner business keys and gaps without returning a collected prefix', () => {
  expect(readRunnerRetryConclusions(prefix([firstEntry, { ...firstEntry, position: 2 }]))).toEqual({
    unavailable: true,
  })
  expect(
    readRunnerRetryConclusions(prefix([firstEntry, recorded(retryLast, 'failure_two', 3)])),
  ).toEqual({ unavailable: true })
  expect(
    readRunnerRetryConclusions(
      prefix([
        firstEntry,
        {
          ...unrelated,
          position: 2,
          session: unwrap(parseOpaqueIdentifier('other_session', 'SessionRef')),
        },
      ]),
    ),
  ).toEqual({ unavailable: true })
  const nonRetry = recorded(observed, 'started', 2)
  expect(
    readRunnerRetryConclusions(prefix([firstEntry, nonRetry, { ...nonRetry, position: 3 }])),
  ).toEqual({ unavailable: true })
})

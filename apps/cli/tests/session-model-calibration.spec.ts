import { judgeMessage } from '@omne-harness-lite/messages'
import { toOpaqueJson } from '@omne-harness-lite/content-blocks'
import { expect, test } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  captureModelLogValue,
  prepareModelLogEntry,
  readSettlementPrefix,
  type ModelLogCategory,
  type ModelLogPurpose,
  type SettlementLogBinding,
  type SettlementRegistration,
} from '@omne-harness-lite/model-request-runtime'
import { authorizedCalibration } from '@omne-harness-lite/session-runtime-local'
import type { LogEntry } from '@omne-harness-lite/session-log'
import { originalPending } from './model-result-fixture.ts'
import { sessionModelHistory } from '../src/session-production-model.ts'

async function fixture(encrypted = false, hasGroup = true) {
  const tenant = unwrap(
    parseTenantId({ organization: 'calibration-org', account: 'calibration-account' }),
  )
  const session = unwrap(parseOpaqueIdentifier('calibration-session', 'SessionRef'))
  const original = originalPending()
  const reply = judgeMessage({
    ...original.reply,
    blocks: encrypted
      ? [
          {
            id: 'encrypted-reasoning',
            kind: 'thinking',
            text: '',
            opaque: toOpaqueJson({
              routeName: 'openai/gpt-6-sol',
              reasoning_details: [
                {
                  type: 'reasoning.encrypted',
                  data: 'fixture-ciphertext',
                  format: 'openai-responses-v1',
                  index: 0,
                },
              ],
            }),
            visibility: { toHuman: false, toModel: true },
          },
        ]
      : original.reply.blocks,
  })
  if ('rejected' in reply || reply.ok.type !== 'assistant' || reply.ok.ending !== 'complete')
    throw new Error('reply fixture rejected')
  const pending = { ...original, reply: reply.ok }
  const run = pending.call.runId,
    attempt = pending.attemptId
  if (run === undefined || attempt === undefined) throw new Error('fixture Run required')
  const shell = { tenant, run, attempt }
  const response = {
    ...pending,
    replyDisposition: 'persisted',
    inputCalibration: {
      ...pending.inputCalibration,
      outputGroup: hasGroup
        ? {
            kind: 'known',
            projectionRevision: 'fixture-v1',
            source: 'reply',
            blockDigests: ['a'.repeat(64)],
            completeness: 'complete',
            usageRef: 'usage',
          }
        : pending.inputCalibration.outputGroup,
    },
  }
  const captured = captureModelLogValue({
    category: 'response',
    input: { kind: 'value', value: response },
  })
  if (!('ok' in captured)) throw new Error('response fixture rejected')
  const entries: LogEntry[] = []
  function append(category: ModelLogCategory, value: unknown, purpose: ModelLogPurpose) {
    const body = captureModelLogValue({ category, input: { kind: 'value', value } })
    if (!('ok' in body)) throw new Error('fixture body rejected')
    const result = prepareModelLogEntry({
      session,
      shell,
      captured: body.ok,
      purpose,
      messagePrefix: [],
    })
    if (!('ok' in result)) throw new Error('fixture entry rejected')
    entries.push({ ...result.ok, session, position: entries.length + 1 })
  }
  append(
    'record',
    {
      kind: 'model_call_dispatched',
      call: pending.call.callId,
      dispatch: pending.dispatch,
      response: pending.id,
      ...pending.route,
    },
    { kind: 'record' },
  )
  append(
    'record',
    {
      kind: 'model_call_opened',
      call: pending.call.callId,
      dispatch: pending.dispatch,
      firstTokenAt: pending.timing.firstTokenAt,
    },
    { kind: 'record' },
  )
  append('message', pending.reply, { kind: 'persistedMessage', response: captured.ok })
  append('response', response, { kind: 'response' })
  const generation = {}
  let currentGeneration: object | null = generation
  const unused = async (): Promise<never> => {
    throw new Error('unexpected fixture mutation')
  }
  const binding: SettlementLogBinding = {
    tenant,
    session,
    generation,
    currentGeneration: () => currentGeneration,
    log: { append: unused, readByKey: unused, readSince: unused },
    readPrefix: async () => ({
      entries,
      tail: entries.length,
      source: { tenant, session, journalGeneration: 'generation', tail: entries.length },
    }),
  }
  const registration: SettlementRegistration = {
    start(_kind, run) {
      const completion = Promise.resolve().then(() => run(new AbortController().signal))
      return { completion, stopped: completion.then(() => undefined), requestStop() {} }
    },
    release() {},
  }
  const read = await readSettlementPrefix({ binding, registration })
  if (!('prefix' in read)) throw new Error('fixture prefix rejected')
  return {
    prefix: read.prefix,
    pending,
    entries,
    revoke: () => {
      currentGeneration = null
    },
  }
}

test('production history supplies the persisted output group instead of an empty calibration source', async () => {
  const f = await fixture()
  const result = authorizedCalibration(
    f.prefix,
    [f.pending.reply],
    { callId: 'next-call', dispatch: 1 },
    sessionModelHistory.calibration,
  )
  if (!('calibration' in result)) throw new Error('calibration unavailable')
  expect(result.outputHistory).toHaveLength(1)
  expect(result.outputHistory[0]?.outputBlocks).toEqual(f.pending.reply.blocks)
  expect(result.outputHistory[0]?.replaySelection).toEqual([
    { sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 },
  ])
})

test('changed selected content cannot borrow an original output group', async () => {
  const f = await fixture()
  const message = { ...f.pending.reply, blocks: [] }
  expect(
    sessionModelHistory.calibration(f.prefix, [message], { callId: 'next-call', dispatch: 1 }),
  ).toEqual({ sourceUnavailable: true })
})

test('empty selected history does not invent a calibration observation', async () => {
  const f = await fixture()
  const result = authorizedCalibration(
    f.prefix,
    [],
    { callId: 'next-call', dispatch: 1 },
    sessionModelHistory.calibration,
  )
  expect(result).toEqual({
    calibration: { kind: 'none', reason: 'no_observation' },
    outputHistory: [],
  })
})

test('encrypted reasoning retains its original output group and opaque bytes', async () => {
  const f = await fixture(true)
  const result = authorizedCalibration(
    f.prefix,
    [f.pending.reply],
    { callId: 'next-call', dispatch: 1 },
    sessionModelHistory.calibration,
  )
  if (!('calibration' in result)) throw new Error('calibration unavailable')
  expect(result.outputHistory).toHaveLength(1)
  expect(result.outputHistory[0]?.outputBlocks).toEqual(f.pending.reply.blocks)
})

test('a response without an output group remains eligible for ordinary full counting', async () => {
  const f = await fixture(false, false)
  expect(
    authorizedCalibration(
      f.prefix,
      [f.pending.reply],
      { callId: 'next-call', dispatch: 1 },
      sessionModelHistory.calibration,
    ),
  ).toEqual({ calibration: { kind: 'none', reason: 'no_observation' }, outputHistory: [] })
})

test('repeated calibration calls retain actual reader checks after the prefix is interpreted', async () => {
  const f = await fixture()
  let reads = 0
  const read: typeof sessionModelHistory.calibration = (...input) => {
    reads += 1
    return sessionModelHistory.calibration(...input)
  }
  for (let index = 0; index < 2; index += 1) {
    const result = authorizedCalibration(
      f.prefix,
      [f.pending.reply],
      { callId: 'next-call', dispatch: 1 },
      read,
    )
    expect(result).toHaveProperty('calibration')
  }
  expect(reads).toBe(2)
  const revoked = authorizedCalibration(
    f.prefix,
    [f.pending.reply],
    { callId: 'next-call', dispatch: 1 },
    (...input) => {
      const result = read(...input)
      f.revoke()
      return result
    },
  )
  expect(reads).toBe(3)
  expect(revoked).toEqual({ unavailable: true })
  expect(
    sessionModelHistory.calibration(f.prefix, [f.pending.reply], {
      callId: 'next-call',
      dispatch: 1,
    }),
  ).toEqual({ sourceUnavailable: true })
})
